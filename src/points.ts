import { Point } from "./types";

export const getSizeFromPoints = (points: readonly Point[]) => {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

/** @arg dimensión, 0 para reescalar solo x, 1 para y */
export const rescalePoints = (
  dimension: 0 | 1,
  newSize: number,
  points: readonly Point[],
  normalize: boolean,
): Point[] => {
  const coordinates = points.map((point) => point[dimension]);
  const maxCoordinate = Math.max(...coordinates);
  const minCoordinate = Math.min(...coordinates);
  const size = maxCoordinate - minCoordinate;
  const scale = size === 0 ? 1 : newSize / size;

  let nextMinCoordinate = Infinity;

  const scaledPoints = points.map((point): Point => {
    const newCoordinate = point[dimension] * scale;
    const newPoint = [...point];
    newPoint[dimension] = newCoordinate;
    if (newCoordinate < nextMinCoordinate) {
      nextMinCoordinate = newCoordinate;
    }
    return newPoint as unknown as Point;
  });

  if (!normalize) {
    return scaledPoints;
  }

  if (scaledPoints.length === 2) {
    // no trasladamos líneas de dos puntos
    return scaledPoints;
  }

  const translation = minCoordinate - nextMinCoordinate;

  const nextPoints = scaledPoints.map(
    (scaledPoint) =>
      scaledPoint.map((value, currentDimension) => {
        return currentDimension === dimension ? value + translation : value;
      }) as [number, number],
  );
  return nextPoints;
};
