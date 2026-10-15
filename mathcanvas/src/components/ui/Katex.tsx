import katex from "katex";
import { memo, useMemo } from "react";

/** Renders LaTeX with KaTeX. Invalid input degrades to red source, never throws. */
export const Katex = memo(function Katex({
  latex,
  display = false,
  className,
}: {
  latex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        throwOnError: false,
        displayMode: display,
        output: "htmlAndMathml",
        // Vietnamese words in a LaTeX text block have no KaTeX font metrics; the page font draws them.
        strict: "ignore",
      }),
    [latex, display],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
