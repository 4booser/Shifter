import { distanceMetres } from '@/lib/calendar/geo';

describe('distanceMetres', () => {
  it('is zero from a point to itself', () => {
    expect(distanceMetres(50.45, 30.52, 50.45, 30.52)).toBe(0);
  });

  it('measures a known city pair within a percent', () => {
    // Kyiv centre to Boryspil airport, ~29 km as the crow flies.
    const d = distanceMetres(50.4501, 30.5234, 50.345, 30.8947);

    expect(d).toBeGreaterThan(28_000);
    expect(d).toBeLessThan(30_500);
  });

  it('resolves a street-scale difference', () => {
    // ~111 metres per 0.001° of latitude.
    const d = distanceMetres(50.45, 30.52, 50.451, 30.52);

    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});
