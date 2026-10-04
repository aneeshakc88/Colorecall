// Redesigns are the default; ?duo=v1 / ?classic=v1 / ?flag=v1 / ?crest=v1 switch back to the original screens and remember it, =v2 undoes that.
const read = (param: string): boolean => {
  const q = new URLSearchParams(window.location.search).get(param);
  try {
    if (q === 'v1' || q === 'v2') localStorage.setItem(`${param}_ui`, q);
    return (q ?? localStorage.getItem(`${param}_ui`)) !== 'v1';
  } catch {
    return q !== 'v1';
  }
};

export const DUO_V2 = read('duo');
export const CLASSIC_V2 = read('classic');
export const FLAG_V2 = read('flag');
export const CREST_V2 = read('crest');

// Bricolage is declared in index.css; ask for it now so it downloads with the app code instead of when the first heading paints.
if (DUO_V2 || CLASSIC_V2 || FLAG_V2 || CREST_V2) {
  document.fonts?.load('800 1em "Bricolage Grotesque"').catch(() => {});
}
