import { sanitizeHTML, decodeHtmlEntities } from "./sanitize";

// Helper: extract the style attribute from the first matching element in sanitized HTML
function getStyle(html, selector = "[style]") {
  const root = document.createElement("div");
  root.innerHTML = sanitizeHTML(html);
  const el = root.querySelector(selector);
  return el ? el.getAttribute("style") : null;
}

describe("sanitizeHTML", () => {
  it("removes blocked tags like script/style/iframe", () => {
    const input = `
      <div>
        <p>Hello</p>
        <script>alert(1)</script>
        <style>body { color: red; }</style>
        <iframe src="https://example.com"></iframe>
      </div>
    `;

    const output = sanitizeHTML(input);
    const root = document.createElement("div");
    root.innerHTML = output;

    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("style")).toBeNull();
    expect(root.querySelector("iframe")).toBeNull();
    expect(root.textContent).toContain("Hello");
  });

  it("removes unsafe event handlers and javascript urls", () => {
    const input = `<a href="javascript:alert(1)" onclick="alert(2)">Link</a>`;
    const output = sanitizeHTML(input);
    const root = document.createElement("div");
    root.innerHTML = output;
    const link = root.querySelector("a");

    expect(link).not.toBeNull();
    expect(link.getAttribute("onclick")).toBeNull();
    expect(link.getAttribute("href")).toBeNull();
  });

  it("keeps safe base64 raster image data urls", () => {
    const input = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA" alt="PDF image">`;
    const output = sanitizeHTML(input);
    const root = document.createElement("div");
    root.innerHTML = output;
    const image = root.querySelector("img");

    expect(image).not.toBeNull();
    expect(image.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
    );
  });

  it("removes non-image data urls", () => {
    const input = `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Link</a>`;
    const output = sanitizeHTML(input);
    const root = document.createElement("div");
    root.innerHTML = output;
    const link = root.querySelector("a");

    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBeNull();
  });

  // --- Style normalization tests ---

  describe("font-size clamping", () => {
    it("clamps large font-size down to 36px", () => {
      const style = getStyle('<p style="font-size: 72px">text</p>');
      expect(style).toBe("font-size: 36px");
    });

    it("clamps small font-size up to 10px", () => {
      const style = getStyle('<p style="font-size: 6px">text</p>');
      expect(style).toBe("font-size: 10px");
    });

    it("passes through in-range font-size unchanged", () => {
      const style = getStyle('<p style="font-size: 16px">text</p>');
      expect(style).toBe("font-size: 16px");
    });
  });

  describe("display filtering", () => {
    it("strips display: flex", () => {
      const style = getStyle('<div style="display: flex">text</div>');
      expect(style).toBeNull();
    });

    it("strips display: grid", () => {
      const style = getStyle('<div style="display: grid">text</div>');
      expect(style).toBeNull();
    });

    it("keeps display: block", () => {
      const style = getStyle('<div style="display: block">text</div>');
      expect(style).toBe("display: block");
    });

    it("keeps display: inline-block", () => {
      const style = getStyle('<span style="display: inline-block">text</span>');
      expect(style).toBe("display: inline-block");
    });

    it("keeps display: table", () => {
      const style = getStyle('<div style="display: table">text</div>');
      expect(style).toBe("display: table");
    });
  });

  describe("white-space filtering", () => {
    it("strips white-space: nowrap", () => {
      const style = getStyle('<p style="white-space: nowrap">text</p>');
      expect(style).toBeNull();
    });

    it("keeps white-space: pre", () => {
      const style = getStyle('<p style="white-space: pre">text</p>');
      expect(style).toBe("white-space: pre");
    });

    it("keeps white-space: pre-wrap", () => {
      const style = getStyle('<p style="white-space: pre-wrap">text</p>');
      expect(style).toBe("white-space: pre-wrap");
    });

    it("keeps white-space: normal", () => {
      const style = getStyle('<p style="white-space: normal">text</p>');
      expect(style).toBe("white-space: normal");
    });
  });

  describe("color handling", () => {
    it("strips near-white color", () => {
      const style = getStyle('<p style="color: rgb(255, 255, 255)">text</p>');
      expect(style).toBeNull();
    });

    it("strips near-white color (light gray)", () => {
      const style = getStyle('<p style="color: rgb(245, 245, 245)">text</p>');
      expect(style).toBeNull();
    });

    it("keeps red color", () => {
      const style = getStyle('<p style="color: rgb(255, 0, 0)">text</p>');
      expect(style).toBe("color: rgb(255, 0, 0)");
    });

    it("keeps dark blue color", () => {
      const style = getStyle('<p style="color: rgb(0, 0, 200)">text</p>');
      expect(style).toBe("color: rgb(0, 0, 200)");
    });
  });

  describe("background-color", () => {
    it("always strips background-color", () => {
      const style = getStyle(
        '<div style="background-color: rgb(255, 0, 0)">text</div>',
      );
      expect(style).toBeNull();
    });

    it("strips even transparent background-color", () => {
      const style = getStyle(
        '<div style="background-color: rgba(0, 0, 0, 0)">text</div>',
      );
      expect(style).toBeNull();
    });
  });

  describe("layout properties stripped entirely", () => {
    it("strips width", () => {
      const style = getStyle('<div style="width: 800px">text</div>');
      expect(style).toBeNull();
    });

    it("strips max-width", () => {
      const style = getStyle('<div style="max-width: 600px">text</div>');
      expect(style).toBeNull();
    });

    it("strips margin-left", () => {
      const style = getStyle('<div style="margin-left: 40px">text</div>');
      expect(style).toBeNull();
    });

    it("strips margin-right", () => {
      const style = getStyle('<div style="margin-right: 40px">text</div>');
      expect(style).toBeNull();
    });

    it("strips border-top", () => {
      const style = getStyle(
        '<div style="border-top: 1px solid black">text</div>',
      );
      expect(style).toBeNull();
    });
  });

  describe("font-family generic extraction", () => {
    it("extracts generic family from stack", () => {
      const style = getStyle(
        '<p style="font-family: &quot;Helvetica Neue&quot;, Arial, sans-serif">text</p>',
      );
      expect(style).toBe("font-family: sans-serif");
    });

    it("extracts monospace from stack", () => {
      const style = getStyle(
        '<pre style="font-family: Courier, monospace">text</pre>',
      );
      expect(style).toBe("font-family: monospace");
    });

    it("strips font-family with no generic family", () => {
      const style = getStyle(
        '<p style="font-family: Arial, Helvetica">text</p>',
      );
      expect(style).toBeNull();
    });
  });

  describe("margin-top/bottom clamping", () => {
    it("clamps large margin-top to 32px", () => {
      const style = getStyle('<p style="margin-top: 100px">text</p>');
      expect(style).toBe("margin-top: 32px");
    });

    it("clamps large margin-bottom to 32px", () => {
      const style = getStyle('<p style="margin-bottom: 200px">text</p>');
      expect(style).toBe("margin-bottom: 32px");
    });

    it("strips negative margin-top", () => {
      const style = getStyle('<p style="margin-top: -20px">text</p>');
      expect(style).toBeNull();
    });

    it("passes through small margin-top unchanged", () => {
      const style = getStyle('<p style="margin-top: 8px">text</p>');
      expect(style).toBe("margin-top: 8px");
    });
  });

  describe("combined style string", () => {
    it("keeps safe props, strips dangerous ones, clamps out-of-range ones", () => {
      const input =
        '<p style="font-weight: bold; width: 800px; font-size: 72px; background-color: rgb(0,0,0); color: rgb(50,50,50); display: flex; margin-top: 10px">text</p>';
      const style = getStyle(input);
      // Should keep font-weight, clamped font-size, clamped margin-top, safe color
      // Should strip width, background-color, display:flex
      expect(style).toContain("font-weight: bold");
      expect(style).toContain("font-size: 36px");
      expect(style).toContain("margin-top: 10px");
      expect(style).toContain("color: rgb(50,50,50)");
      expect(style).not.toContain("width");
      expect(style).not.toContain("background-color");
      expect(style).not.toContain("display");
    });
  });

  describe("safe formatting properties pass through", () => {
    it("keeps font-weight bold", () => {
      const style = getStyle('<strong style="font-weight: bold">text</strong>');
      expect(style).toBe("font-weight: bold");
    });

    it("keeps text-align center", () => {
      const style = getStyle('<p style="text-align: center">text</p>');
      expect(style).toBe("text-align: center");
    });

    it("keeps text-decoration underline", () => {
      const style = getStyle(
        '<span style="text-decoration: underline">text</span>',
      );
      expect(style).toBe("text-decoration: underline");
    });

    it("keeps list-style-type disc", () => {
      const style = getStyle('<ul style="list-style-type: disc">text</ul>');
      expect(style).toBe("list-style-type: disc");
    });
  });

  describe("line-height clamping", () => {
    it("clamps unitless line-height above 3.0", () => {
      const style = getStyle('<p style="line-height: 5">text</p>');
      expect(style).toBe("line-height: 3");
    });

    it("clamps unitless line-height below 1.0", () => {
      const style = getStyle('<p style="line-height: 0.5">text</p>');
      expect(style).toBe("line-height: 1");
    });

    it("passes through in-range unitless line-height", () => {
      const style = getStyle('<p style="line-height: 1.5">text</p>');
      expect(style).toBe("line-height: 1.5");
    });

    it("clamps px line-height", () => {
      const style = getStyle('<p style="line-height: 60px">text</p>');
      expect(style).toBe("line-height: 48px");
    });

    it("passes through valid px line-height", () => {
      const style = getStyle('<p style="line-height: 20px">text</p>');
      expect(style).toBe("line-height: 20px");
    });
  });

  describe("text-indent and padding clamping", () => {
    it("clamps text-indent to 80px max", () => {
      const style = getStyle('<p style="text-indent: 100px">text</p>');
      expect(style).toBe("text-indent: 80px");
    });

    it("strips negative text-indent", () => {
      const style = getStyle('<p style="text-indent: -20px">text</p>');
      expect(style).toBeNull();
    });

    it("clamps padding-left to 40px max", () => {
      const style = getStyle('<p style="padding-left: 80px">text</p>');
      expect(style).toBe("padding-left: 40px");
    });

    it("clamps padding-top to 24px max", () => {
      const style = getStyle('<p style="padding-top: 50px">text</p>');
      expect(style).toBe("padding-top: 24px");
    });

    it("strips negative padding-bottom", () => {
      const style = getStyle('<p style="padding-bottom: -5px">text</p>');
      expect(style).toBeNull();
    });
  });

  describe("CSS injection protection", () => {
    it("strips expression() in style values", () => {
      const style = getStyle(
        '<div style="width: expression(alert(1))">text</div>',
      );
      expect(style).toBeNull();
    });

    it("strips url() in style values", () => {
      const style = getStyle(
        '<div style="background: url(javascript:alert(1))">text</div>',
      );
      expect(style).toBeNull();
    });

    it("strips @import in style values", () => {
      const style = getStyle(
        '<div style="width: @import url(evil)">text</div>',
      );
      expect(style).toBeNull();
    });
  });

  describe("target=_blank rel enrichment", () => {
    it("adds noopener and noreferrer to links with target=_blank", () => {
      const input = '<a href="https://example.com" target="_blank">Link</a>';
      const output = sanitizeHTML(input);
      const root = document.createElement("div");
      root.innerHTML = output;
      const link = root.querySelector("a");
      expect(link).not.toBeNull();
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    });
  });

  describe("data-* attributes", () => {
    it("preserves data-* attributes", () => {
      const input = '<span data-custom="hello">text</span>';
      const output = sanitizeHTML(input);
      const root = document.createElement("div");
      root.innerHTML = output;
      expect(root.querySelector("span").getAttribute("data-custom")).toBe(
        "hello",
      );
    });
  });

  describe("vbscript: URL blocking", () => {
    it("removes vbscript: URLs from href", () => {
      const input = '<a href="vbscript:alert(1)">Link</a>';
      const output = sanitizeHTML(input);
      const root = document.createElement("div");
      root.innerHTML = output;
      expect(root.querySelector("a").getAttribute("href")).toBeNull();
    });
  });

  describe("empty/null input", () => {
    it("returns empty string for null input", () => {
      expect(sanitizeHTML(null)).toBe("");
    });

    it("returns empty string for empty string input", () => {
      expect(sanitizeHTML("")).toBe("");
    });
  });

  describe("allowed attributes", () => {
    it("preserves href on anchor for safe URLs", () => {
      const input = '<a href="https://example.com">Link</a>';
      const output = sanitizeHTML(input);
      const root = document.createElement("div");
      root.innerHTML = output;
      expect(root.querySelector("a").getAttribute("href")).toBe(
        "https://example.com",
      );
    });

    it("preserves alt and title attributes", () => {
      const input = '<img alt="photo" title="A photo">';
      const output = sanitizeHTML(input);
      const root = document.createElement("div");
      root.innerHTML = output;
      const img = root.querySelector("img");
      expect(img.getAttribute("alt")).toBe("photo");
      expect(img.getAttribute("title")).toBe("A photo");
    });

    it("removes disallowed attributes", () => {
      const input = '<div tabindex="0" class="foo">text</div>';
      const output = sanitizeHTML(input);
      const root = document.createElement("div");
      root.innerHTML = output;
      const div = root.querySelector("div");
      expect(div.getAttribute("tabindex")).toBeNull();
      expect(div.getAttribute("class")).toBe("foo");
    });
  });

  describe("decodeHtmlEntities", () => {
    it("returns input unchanged if it has no &", () => {
      expect(decodeHtmlEntities("hello world")).toBe("hello world");
    });

    it("returns input unchanged for non-string", () => {
      expect(decodeHtmlEntities(42)).toBe(42);
      expect(decodeHtmlEntities(null)).toBe(null);
    });

    it("decodes common named entities", () => {
      expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
      expect(decodeHtmlEntities("&amp;")).toBe("&");
      expect(decodeHtmlEntities("&lt;")).toBe("<");
      expect(decodeHtmlEntities("&gt;")).toBe(">");
      expect(decodeHtmlEntities("&quot;")).toBe('"');
      expect(decodeHtmlEntities("&apos;")).toBe("'");
    });

    it("decodes decimal numeric entities", () => {
      expect(decodeHtmlEntities("&#65;")).toBe("A");
      expect(decodeHtmlEntities("&#169;")).toBe("\u00A9");
    });

    it("decodes hex numeric entities", () => {
      expect(decodeHtmlEntities("&#x41;")).toBe("A");
      expect(decodeHtmlEntities("&#xa9;")).toBe("\u00A9");
    });

    it("handles mixed text with entities", () => {
      expect(decodeHtmlEntities("a &amp; b &lt; c")).toBe("a & b < c");
    });

    it("leaves unknown entities unchanged", () => {
      expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
    });
  });

  describe("edge cases", () => {
    it("returns empty string when document is undefined", () => {
      const originalDocument = global.document;
      // @ts-ignore
      global.document = undefined;
      expect(sanitizeHTML("<p>hello</p>")).toBe("");
      global.document = originalDocument;
    });

    it("passes through line-height with non-px, non-unitless value", () => {
      const style = getStyle('<p style="line-height: 1.5em">text</p>');
      expect(style).toBe("line-height: 1.5em");
    });

    it("keeps color that is not near-white", () => {
      const style = getStyle('<p style="color: rgb(200, 200, 200)">text</p>');
      expect(style).toBe("color: rgb(200, 200, 200)");
    });

    it("strips color that is not parseable as rgb", () => {
      const style = getStyle('<p style="color: red">text</p>');
      expect(style).toBe("color: red");
    });

    it("strips font-size with unparseable value", () => {
      const style = getStyle('<p style="font-size: large">text</p>');
      expect(style).toBe("font-size: large");
    });
  });

  describe("additional safe style properties", () => {
    it("keeps letter-spacing", () => {
      const style = getStyle('<p style="letter-spacing: 2px">text</p>');
      expect(style).toBe("letter-spacing: 2px");
    });

    it("keeps word-spacing", () => {
      const style = getStyle('<p style="word-spacing: 4px">text</p>');
      expect(style).toBe("word-spacing: 4px");
    });

    it("keeps border-collapse", () => {
      const style = getStyle(
        '<table style="border-collapse: collapse">text</table>',
      );
      expect(style).toBe("border-collapse: collapse");
    });

    it("keeps vertical-align", () => {
      const style = getStyle('<span style="vertical-align: top">text</span>');
      expect(style).toBe("vertical-align: top");
    });

    it("keeps border-radius", () => {
      const style = getStyle('<div style="border-radius: 4px">text</div>');
      expect(style).toBe("border-radius: 4px");
    });

    it("clamps padding-right to 40px max", () => {
      const style = getStyle('<p style="padding-right: 80px">text</p>');
      expect(style).toBe("padding-right: 40px");
    });

    it("strips negative padding-right", () => {
      const style = getStyle('<p style="padding-right: -5px">text</p>');
      expect(style).toBeNull();
    });
  });
});
