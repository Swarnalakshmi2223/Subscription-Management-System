export function apiError(err, fallback = 'Something went wrong') {
  const data = err.response?.data;
  return { message: data?.message || fallback, details: data?.errors || [] };
}