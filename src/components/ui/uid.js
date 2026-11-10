// A small id source for the pickers' aria-controls / aria-activedescendant links.
// (Vue's useId would work, but pulls more of Vue into the shared runtime chunk
// that public pages load, so it is avoided here; see the F08 plan note.)
let n = 0;
export const nextUid = () => `ui${++n}`;
