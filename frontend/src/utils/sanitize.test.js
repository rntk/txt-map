import { sanitizeHTML } from "./sanitize";

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
});
