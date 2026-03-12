/**
 * Static fallback images for the style quiz when the DB hasn't been seeded.
 * All photo IDs are from actual Unsplash wedding searches — verified to be in
 * a wedding/engagement context.
 */

interface FallbackImage {
  id: string;
  subcategory: string;
  image_url: string;
  thumbnail_url: string;
  alt_text: string;
}

const img = (
  id: string,
  subcategory: string,
  photoId: string,
  alt: string
): FallbackImage => ({
  id,
  subcategory,
  image_url: `https://images.unsplash.com/photo-${photoId}?w=800&q=80`,
  thumbnail_url: `https://images.unsplash.com/photo-${photoId}?w=400&q=70`,
  alt_text: alt,
});

export const FALLBACK_IMAGES: Record<string, FallbackImage[]> = {
  overall_vibe: [
    img("v-modern", "modern", "1712314947761-a8d718bd8c32", "Modern banquet hall with chandeliers"),
    img("v-classic", "classic", "1677768061409-3d4fbd0250d1", "Classic formal wedding dinner table"),
    img("v-bohemian", "bohemian", "1618106494700-4b0049e83ed8", "Boho outdoor wedding tent"),
    img("v-glamorous", "glamorous", "1723832348140-a2d9eb1753b1", "Glamorous table with chandelier"),
    img("v-minimalist", "minimalist", "1696271026754-2eb5a6cd08a2", "Minimalist wedding table setting"),
    img("v-rustic", "rustic", "1618107158953-dd4c6424b638", "Rustic wooden table with white cloth"),
    img("v-romantic", "romantic", "1751257576155-9f25d26fb6ef", "Romantic wedding table with candles and flowers"),
    img("v-art_deco", "art_deco", "1758810743028-6b8e150ec98f", "Elegant table with floral arrangements"),
  ],
  flowers: [
    img("f-roses", "roses", "1521543832500-49e69fb2bea2", "Bride holding rose wedding bouquet"),
    img("f-peonies", "peonies", "1594149596808-e3b6174968b3", "Pink and white peony wedding bouquet"),
    img("f-orchids", "orchids", "1522142540300-60ae5b4bc569", "Rose and orchid bridal bouquet"),
    img("f-wildflowers", "wildflowers", "1595467959554-9ffcbf37f10f", "White and green wildflower bouquet"),
    img("f-lilies", "lilies", "1521520368710-3ab197656d60", "White and pink petaled bridal bouquet"),
    img("f-protea", "protea", "1525258946800-98cfd641d0de", "Modern bridal bouquet with mixed flowers"),
    img("f-cascading", "cascading_bouquet", "1495610015663-83e7e5246070", "Bride holding cascading petal bouquet"),
    img("f-round", "round_bouquet", "1604531826103-7c626b90a5f4", "Round pink and white roses bouquet"),
    img("f-center", "centerpiece", "1674965381554-955d6a573354", "Wedding table floral centerpiece"),
    img("f-garland", "garland", "1758810743028-6b8e150ec98f", "Wedding table with garland floral arrangement"),
    img("f-arch", "arch", "1641834919507-b0271fe5186b", "Wedding arch decorated with flowers and greenery"),
    img("f-aisle", "aisle_petals", "1772404245518-b88fac824c78", "Outdoor wedding ceremony aisle with floral decorations"),
    img("f-altar", "altar_flowers", "1641834916652-c7436fd6f99a", "Wedding altar decorated with flowers and greenery"),
  ],
  tables: [
    img("t-formal", "formal", "1677768061409-3d4fbd0250d1", "Formal wedding dinner table setting"),
    img("t-casual", "casual", "1618107158953-dd4c6424b638", "Casual wedding table with cloth"),
    img("t-family", "family_style", "1696271026924-06168ee4dbe0", "Long family style wedding dinner table"),
    img("t-sweet", "sweetheart", "1696271026754-2eb5a6cd08a2", "Intimate sweetheart table setting"),
    img("t-candel", "candelabra", "1751257576155-9f25d26fb6ef", "Wedding candelabra with flowers and candles"),
    img("t-flolow", "floral_low", "1674965381554-955d6a573354", "Low wedding floral centerpiece"),
    img("t-flohigh", "floral_tall", "1662553824684-16a98bf8115e", "Tall wedding floral centerpiece on table"),
    img("t-lantern", "lanterns", "1723832348140-a2d9eb1753b1", "Wedding table with lantern and chandelier decor"),
  ],
  lighting: [
    img("l-fairy", "fairy_lights", "1546907432-a6a0fc1e0a33", "Wedding reception with fairy string lights"),
    img("l-candle", "candles", "1751257576155-9f25d26fb6ef", "Romantic wedding candlelight table"),
    img("l-chande", "chandeliers", "1712314947761-a8d718bd8c32", "Wedding reception crystal chandeliers"),
    img("l-paper", "paper_lanterns", "1651667773148-9283495a32b7", "Hanging lights at wedding reception"),
    img("l-up", "uplighting", "1746044159252-ed0ccafd7b46", "Beautifully lit indoor wedding event space"),
    img("l-edison", "edison_bulbs", "1651667773089-8de0335fcd7c", "Edison bulb chandelier at wedding"),
    img("l-neon", "neon_sign", "1654742705586-b2ab66bceda7", "Bride and groom first dance with neon backdrop"),
  ],
  venue_decor: [
    img("d-drape", "draped_fabric", "1648056501972-841dceebf963", "Draped fabric curtain at wedding venue"),
    img("d-balloon", "balloon_arch", "1759954644836-a57275881ded", "Wedding ceremony setup with arch decoration"),
    img("d-floral", "floral_arch", "1763560836989-d3636e2f82d8", "Wedding floral arch with mountain backdrop"),
    img("d-green", "greenery_wall", "1769812344337-ec16a1b7cef8", "Wedding ceremony with greenery arch backdrop"),
    img("d-mirror", "mirror_backdrop", "1728566826494-759fd32b1826", "Wedding mirror with flower arrangement"),
    img("d-minimal", "minimal", "1765854638026-8abcd72c75c3", "Minimalist heart-shaped floral arch"),
  ],
};
