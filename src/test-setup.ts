import "@testing-library/jest-dom";

// Reset jsdom location before each test
beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// Silence React act() warnings in tests that intentionally don't wrap
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("act(")) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
