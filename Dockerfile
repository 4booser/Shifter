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

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /source
COPY ["server/Shifter.csproj", "server/"]
RUN dotnet restore "server/Shifter.csproj"
COPY server/ server/
COPY --from=client /server/wwwroot server/wwwroot
# SkipClientBuild: the bundle is already here, and this image has no npm.
RUN dotnet publish "server/Shifter.csproj" \
    -c $BUILD_CONFIGURATION \
    -o /app/publish \
    /p:UseAppHost=false \
    -p:SkipClientBuild=true

# Migrations run from their own image before the API starts. It carries the SDK
# and the sources because `dotnet ef` needs both; the runtime image below stays
# small and has no tooling in it.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS migrate
WORKDIR /source
ENV PATH="${PATH}:/root/.dotnet/tools"
RUN dotnet tool install --global dotnet-ef --version 10.0.*
COPY ["server/Shifter.csproj", "server/"]
RUN dotnet restore "server/Shifter.csproj"
COPY server/ server/
# Two databases, two contexts, applied in order. `dotnet ef` only builds the
# project, and the Angular target runs on publish, so npm is never reached here.
ENTRYPOINT ["sh", "-c", "\
    dotnet ef database update --project server/Shifter.csproj --context ShifterDbContext && \
    dotnet ef database update --project server/Shifter.csproj --context TokensDbContext"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
# The runtime image ships without wget or curl, so the compose healthcheck had
# nothing to run and reported the container unhealthy while it was serving
# traffic perfectly well. A few megabytes buys a probe that tells the truth.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "Shifter.dll"]
