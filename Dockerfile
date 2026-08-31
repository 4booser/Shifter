# The web bundle builds first and in its own stage, so the npm layer is cached
# independently of the .NET sources: touching a controller does not reinstall
# node_modules.
FROM node:24-alpine AS client
WORKDIR /web
COPY ["web/package.json", "web/package-lock.json", "./"]
RUN npm ci
COPY web/ ./
# Which build a crash report came from. Without it every report from
# production says "dev" and a fault that was fixed last week goes on being
# chased.
ARG BUILD_REF=dev
ENV NEXT_PUBLIC_BUILD=$BUILD_REF
# `next build` exports to out/, and the sync script copies that to
# ../server/wwwroot — which lands at /server/wwwroot here.
RUN npm run build

# The front end being rebuilt on Vite, in its own stage for the same reason.
# It ships beside the current one rather than instead of it: the screens that
# have moved across can be looked at on the real server without costing
# anybody a screen that has not.
FROM node:24-alpine AS next
WORKDIR /app
COPY ["app/package.json", "app/package-lock.json", "./"]
RUN npm ci
COPY app/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /source
COPY ["server/Shifter.csproj", "server/"]
RUN dotnet restore "server/Shifter.csproj"
COPY server/ server/
COPY --from=client /server/wwwroot server/wwwroot
# After the bundle above, not before: that copy replaces the whole directory.
COPY --from=next /app/dist server/wwwroot/next
# SkipClientBuild: the bundle is already here, and this image has no npm.
RUN dotnet publish "server/Shifter.csproj" \
    -c $BUILD_CONFIGURATION \
    -o /app/publish \
    /p:UseAppHost=false \
    -p:SkipClientBuild=true

# Migrations run from their own image before the API starts. It carries the SDK
# and the sources because `dotnet ef` needs both; the runtime image below stays
# small and has no tooling in it.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS migrate-build
WORKDIR /source
ENV PATH="${PATH}:/root/.dotnet/tools"
RUN dotnet tool install --global dotnet-ef --version 10.0.*
COPY ["server/Shifter.csproj", "server/"]
RUN dotnet restore "server/Shifter.csproj"
COPY server/ server/
# Compiled HERE, where the CI runner has memory to spare — not at deploy
# time on the production box. `dotnet ef database update` builds the project
# with Roslyn before migrating, and Roslyn on a one-gigabyte droplet next to
# a live Postgres is how the site once went down mid-deploy. A bundle is the
# same migration history, compiled once, run as a plain binary.
RUN dotnet ef migrations bundle --project server/Shifter.csproj \
        --context ShifterDbContext --self-contained -r linux-x64 -o /bundle-shifter \
    && dotnet ef migrations bundle --project server/Shifter.csproj \
        --context TokensDbContext --self-contained -r linux-x64 -o /bundle-tokens

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0 AS migrate
COPY --from=migrate-build /bundle-shifter /bundle-tokens /
# Two databases, two contexts, applied in order — as before, minus the
# compiler. The bundles read the same connection strings the old entrypoint
# used, passed explicitly because a bundle does not read ASP.NET config.
ENTRYPOINT ["sh", "-c", "\
    /bundle-shifter --connection \"$ConnectionStrings__Shifter\" && \
    /bundle-tokens --connection \"$ConnectionStrings__Tokens\""]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
# The runtime image ships without wget or curl, so the compose healthcheck had
# nothing to run and reported the container unhealthy while it was serving
# traffic perfectly well. A few megabytes buys a probe that tells the truth.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
EXPOSE 8080
# «Деплой прошёл» and «прод обновился» are different claims; /status telling
# the commit it was built from is what separates them.
ARG BUILD_REF=dev
ENV BUILD_REF=$BUILD_REF
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "Shifter.dll"]
