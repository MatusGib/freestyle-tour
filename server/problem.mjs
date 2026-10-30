// An error about one field of the curated data, named by its path (for
// example eventWinds.378.knots), so the developer panel can show the reason
// next to that field.
export const problem = (path, message) => Object.assign(new Error(message), { path });
