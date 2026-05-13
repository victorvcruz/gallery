declare module "justified-layout" {
  interface Options {
    containerWidth?: number;
    containerPadding?: number | { top: number; right: number; bottom: number; left: number };
    boxSpacing?: number | { horizontal: number; vertical: number };
    targetRowHeight?: number;
    targetRowHeightTolerance?: number;
    maxNumRows?: number;
    forceAspectRatio?: boolean | number;
    showWidows?: boolean;
    fullWidthBreakoutRowCadence?: boolean | number;
  }

  interface Box {
    aspectRatio: number;
    top: number;
    width: number;
    height: number;
    left: number;
  }

  interface Result {
    containerHeight: number;
    widowCount: number;
    boxes: Box[];
  }

  function justifiedLayout(
    input: number[] | { width: number; height: number }[],
    options?: Options
  ): Result;

  export = justifiedLayout;
}
