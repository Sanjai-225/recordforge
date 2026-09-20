export function useRouter() {
  return {
    replace: (url: string) => location.assign(url),
    refresh: () => location.reload(),
  };
}
