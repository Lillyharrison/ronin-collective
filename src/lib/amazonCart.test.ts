import { describe, it, expect } from "vitest";
import { parseAmazonUrl, resolveAmazon, buildCartLinks, splitForAmazon, cartQuantity, isValidAsin } from "./amazonCart";

describe("ASIN parsing", () => {
  it.each([
    ["https://www.amazon.com/Some-Thing/dp/B07XJ8C8F5", "B07XJ8C8F5", "www.amazon.com"],
    ["https://www.amazon.com/dp/B07XJ8C8F5?tag=x&ref=sr_1_1", "B07XJ8C8F5", "www.amazon.com"],
    ["https://amazon.com/gp/product/b07xj8c8f5/ref=ppx", "B07XJ8C8F5", "www.amazon.com"],
    ["https://www.amazon.com/ASIN/B07XJ8C8F5", "B07XJ8C8F5", "www.amazon.com"],
    ["https://www.amazon.com/product/B07XJ8C8F5#reviews", "B07XJ8C8F5", "www.amazon.com"],
    ["https://www.amazon.co.uk/dp/B07XJ8C8F5?th=1", "B07XJ8C8F5", "www.amazon.co.uk"],
  ])("%s", (url, asin, site) => expect(parseAmazonUrl(url)).toEqual({ asin, site }));
  it("short links and non-Amazon links give none", () => {
    expect(parseAmazonUrl("https://amzn.to/3abcDEF")).toBeNull();
    expect(parseAmazonUrl("https://a.co/d/abc1234")).toBeNull();
    expect(parseAmazonUrl("https://www.walmart.com/dp/B07XJ8C8F5")).toBeNull();
    expect(parseAmazonUrl("not a url")).toBeNull();
  });
  it("stored asin wins; parsed link is the fallback", () => {
    expect(resolveAmazon({ asin: "B000000001", website_url: null })).toEqual({ asin: "B000000001", site: "www.amazon.com" });
    expect(resolveAmazon({ asin: null, website_url: "https://www.amazon.de/dp/B000000002" })).toEqual({ asin: "B000000002", site: "www.amazon.de" });
    expect(resolveAmazon({ asin: null, website_url: "https://amzn.to/x" })).toBeNull();
  });
  it("validates 10 uppercase letters or digits", () => {
    expect(isValidAsin("B07XJ8C8F5")).toBe(true);
    expect(isValidAsin("B07XJ8C8F")).toBe(false);
    expect(isValidAsin("b07xj8c8f5")).toBe(false);
  });
});

describe("cart links", () => {
  const line = (i: number, site = "www.amazon.com") => ({ name: `I${i}`, asin: `B${String(i).padStart(9, "0")}`, site, quantity: i });
  it("builds one link with several items and quantities, no affiliate tag", () => {
    const [l] = buildCartLinks([line(1), line(2)]);
    expect(l.url).toBe("https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B000000001&Quantity.1=1&ASIN.2=B000000002&Quantity.2=2");
    expect(l.url).not.toMatch(/tag=|AssociateTag/);
  });
  it("splits over 40 items into numbered parts", () => {
    const links = buildCartLinks(Array.from({ length: 41 }, (_, i) => line(i + 1)));
    expect(links.map(l => [l.part, l.parts, l.count])).toEqual([[1, 2, 40], [2, 2, 1]]);
    expect(links[1].url).toContain("ASIN.1=B000000041");
  });
  it("groups by Amazon site", () => {
    const links = buildCartLinks([line(1), line(2, "www.amazon.co.uk")]);
    expect(links.map(l => l.site)).toEqual(["www.amazon.com", "www.amazon.co.uk"]);
  });
  it("quantity falls back to the default quantity, then 1", () => {
    expect(cartQuantity("3 packs", "5")).toBe(3);
    expect(cartQuantity(null, "2")).toBe(2);
    expect(cartQuantity("", null)).toBe(1);
  });
  it("items without a code are excluded and listed with their links", () => {
    const lib = new Map([["a", { asin: "B000000001" }], ["b", { asin: null, website_url: "https://shop.example/x" }], ["c", { asin: null, website_url: "https://amzn.to/q", default_quantity: "4" }]]);
    const { amazon, other } = splitForAmazon([{ library_item_id: "a", name: "A", quantity: "2" }, { library_item_id: "b", name: "B" }, { library_item_id: "c", name: "C" }], lib);
    expect(amazon).toEqual([{ name: "A", asin: "B000000001", site: "www.amazon.com", quantity: 2 }]);
    expect(other).toEqual([{ name: "B", quantity: null, url: "https://shop.example/x" }, { name: "C", quantity: "4", url: "https://amzn.to/q" }]);
  });
});
