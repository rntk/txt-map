import "@testing-library/jest-dom/vitest";

class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }

  disconnect() {}

  observe(target) {
    this.callback([{ isIntersecting: true, target }]);
  }

  unobserve() {}
}

if (typeof global.IntersectionObserver === "undefined") {
  global.IntersectionObserver = MockIntersectionObserver;
}
