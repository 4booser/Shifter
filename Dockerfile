FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

# The Angular app builds in its own stage so the npm install layer is cached
# independently of the .NET sources. Output lands in /wwwroot (see angular.json).
FROM node:24-alpine AS client
WORKDIR /client
COPY ["client/package.json", "client/package-lock.json", "./"]
RUN npm ci
COPY client/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["Shifter.csproj", "./"]
RUN dotnet restore "Shifter.csproj"
COPY . .
COPY --from=client /wwwroot ./wwwroot
WORKDIR "/src/"
RUN dotnet build "./Shifter.csproj" -c $BUILD_CONFIGURATION -o /app/build -p:SkipClientBuild=true

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./Shifter.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false -p:SkipClientBuild=true

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Shifter.dll"]
