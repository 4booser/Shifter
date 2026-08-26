/**
 * Great-circle distance, metres. Haversine on a spherical Earth is within a
 * third of a percent everywhere people work shifts — plenty for "am I at
 * the bar".
 */
export function distanceMetres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radius = 6_371_000;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = rad(latitudeB - latitudeA);
  const dLon = rad(longitudeB - longitudeA);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(latitudeA)) * Math.cos(rad(latitudeB)) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(a));
}
