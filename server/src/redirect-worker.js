// lastpick.in and www.lastpick.in -> https://customer.lastpick.in (a tiny Cloudflare Worker, free plan).
export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect(`https://customer.lastpick.in${url.pathname === "/" ? "" : url.pathname}`, 301);
  },
};
