export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, "https://url36-converter-api.onrender.com");
    return fetch(new Request(target, request));
  }
};
