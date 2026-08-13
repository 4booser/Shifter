# Shifter

ASP.NET Core API (.NET 10) with an Angular client.

## Layout

```
Shifter.csproj            API project (Clean Architecture folders under src/)
src/Api                   controllers, middleware, Program.cs
src/Application           features, DTOs, handlers
src/Infrastructure        EF Core, repositories
src/Domain                entities
client/                   Angular workspace
wwwroot/                  Angular build output (generated, git-ignored)
```

## Development

Run the API and the Angular dev server side by side:

```bash
dotnet run --launch-profile http      # API on http://localhost:5208
cd client && npm start                # SPA on http://localhost:4200
```

Open http://localhost:4200. Requests to `/shifter/*` are proxied to the API by
`client/proxy.conf.json`, so the client always uses relative URLs and there is
no CORS configuration to maintain.

## Production

`dotnet publish` runs `ng build` automatically, writing the bundle to `wwwroot`,
which the API serves along with a SPA fallback for deep links:

```bash
dotnet publish -c Release
docker build -t shifter .             # SPA builds in its own stage
```

Pass `-p:SkipClientBuild=true` to publish a prebuilt `wwwroot` without invoking
npm.
