// Runs inside workerd (started by test/seo.mjs through Miniflare) so that the tests see what the real
// HTMLRewriter does, escaping included. Node has no HTMLRewriter, so test/seo.mjs stands one in that
// records what each handler asks for and sends it here: { html, rules: [{ selector, ops }] }.
// An op is setAttribute(name, value), setInnerContent(text) or remove(); nothing else is replayed.
export default {
  async fetch(request) {
    const { html, rules } = await request.json();
    const rw = new HTMLRewriter();
    for (const { selector, ops } of rules) {
      rw.on(selector, {
        element(el) {
          for (const op of ops) {
            if (op.op === "setAttribute") el.setAttribute(op.name, op.value);
            else if (op.op === "setInnerContent") el.setInnerContent(op.value);
            else if (op.op === "remove") el.remove();
          }
        },
      });
    }
    const out = rw.transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
    return new Response(await out.text(), { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
