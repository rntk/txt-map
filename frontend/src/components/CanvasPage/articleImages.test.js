import { describe, expect, it } from "vitest";
import {
  extractArticleImages,
  getDisplayOffsetAfterNormalizedIndex,
  isSafeImageSrc,
} from "./articleImages";

describe("article image extraction", () => {
  it("anchors images between matching article text", () => {
    const images = extractArticleImages(
      '<article><p>Alpha</p><img src="/media/chart.png" alt="Chart" /><p>Beta gamma.</p></article>',
      "https://example.com/articles/story.html",
      "Alpha\nBeta gamma.",
    );

    expect(images).toEqual([
      {
        src: "https://example.com/media/chart.png",
        alt: "Chart",
        title: undefined,
        anchorOffset: 5,
      },
    ]);
  });

  it("uses following article text when the prefix does not match", () => {
    const images = extractArticleImages(
      '<article><p>Navigation text not in article.</p><img src="/media/chart.png" alt="Chart" /><p>Beta gamma.</p></article>',
      "https://example.com/articles/story.html",
      "Alpha\nBeta gamma.",
    );

    expect(images).toEqual([
      {
        src: "https://example.com/media/chart.png",
        alt: "Chart",
        title: undefined,
        anchorOffset: 6,
      },
    ]);
  });

  it("keeps missing alt text empty instead of using a caption sentinel", () => {
    const images = extractArticleImages(
      '<article><p>Alpha</p><img src="/media/chart.png" /></article>',
      "https://example.com/articles/story.html",
      "Alpha",
    );

    expect(images[0].alt).toBe("");
  });

  it("filters unsafe and ambiguous image sources", () => {
    expect(isSafeImageSrc("https://example.com/image.png")).toBe(true);
    expect(isSafeImageSrc("/image.png")).toBe(true);
    expect(isSafeImageSrc("./image.png")).toBe(true);
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("?image=1")).toBe(false);
    expect(isSafeImageSrc("#image")).toBe(false);
    expect(isSafeImageSrc("\\\\host\\share\\image.png")).toBe(false);
  });

  it("returns zero before the first normalized character", () => {
    expect(
      getDisplayOffsetAfterNormalizedIndex({ text: "Alpha", offsets: [0] }, 0),
    ).toBe(0);
  });
});
