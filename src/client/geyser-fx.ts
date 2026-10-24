// Só apresentação: altura no 3D e na demo segue o prazo autoritativo, sem alterar a posição2D.
export const GEYSER_FX = { color: '#73d9ff', foam: '#d9f8ff', height: 1.8 };
export const geyserHeight = (left: number) => left <= 0 ? 0 : GEYSER_FX.height * Math.min(1, left / .2);
