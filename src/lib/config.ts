export const mocksEnabled = import.meta.env.VITE_ENABLE_MOCKS === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === undefined)
