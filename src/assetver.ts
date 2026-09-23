declare const __ASSET_VER__: string;
/** Build stamp appended to every model/sprite/portrait URL so browsers never show stale art. */
export const V = typeof __ASSET_VER__ !== 'undefined' ? __ASSET_VER__ : 'dev';
export const q = `?v=${V}`;
