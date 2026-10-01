import { hasDifferentSlotLocation, matchesSlotLocation } from './rotaLocationMatch';

describe('matchesSlotLocation', () => {
  test('matches the main yard and an extra yard', () => {
    expect(matchesSlotLocation('Rugby', ['Nuneaton'], 'Rugby')).toBe(true);
    expect(matchesSlotLocation('Rugby', ['Nuneaton'], 'Nuneaton')).toBe(true);
    expect(matchesSlotLocation('Rugby', ['Nuneaton'], 'NRC')).toBe(false);
  });

  test('empty or wildcard main yard matches every yard', () => {
    expect(matchesSlotLocation('', [], 'Nuneaton')).toBe(true);
    expect(matchesSlotLocation('both', [], 'NRC')).toBe(true);
    expect(matchesSlotLocation('all', ['Rugby'], 'Nuneaton')).toBe(true);
  });
});

describe('hasDifferentSlotLocation', () => {
  test('is true only when none of their yards is the slot', () => {
    expect(hasDifferentSlotLocation('Rugby', ['Nuneaton'], 'NRC')).toBe(true);
    expect(hasDifferentSlotLocation('Rugby', ['Nuneaton'], 'Nuneaton')).toBe(false);
    expect(hasDifferentSlotLocation('', [], 'Nuneaton')).toBe(false);
    expect(hasDifferentSlotLocation('any', [], 'Rugby')).toBe(false);
  });
});
