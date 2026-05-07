/* eslint-disable jsx-a11y/alt-text */
// react-pdf's <Image /> uses different prop semantics from DOM <img>;
// alt text isn't part of the API and a11y is moot in the printed output.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// Register Fraunces (display) + Inter (body) so the PDF matches the rest
// of the editorial chrome. We pull from fontsource via jsDelivr — versioned,
// CDN-cached, served as raw .ttf so react-pdf can fetch without parsing CSS
// (Google's `fonts.gstatic.com/s/<family>/v<n>/<hash>.ttf` URLs aren't
// stable; the hash component rotates and 404s with no warning).
//
// Pinned to specific package versions so a future fontsource release can't
// break in-flight lookbook downloads.
const FRAUNCES_BASE =
  "https://cdn.jsdelivr.net/fontsource/fonts/fraunces@5.2.5";
const INTER_BASE = "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5";

// `register` is idempotent — react-pdf de-dupes by family — but we still
// guard the registration calls so a font-CDN hiccup doesn't crash the
// module-load path (the document falls back to react-pdf's built-in
// Helvetica when a registered face fails to fetch at render time).
try {
  Font.register({
    family: "Fraunces",
    fonts: [
      { src: `${FRAUNCES_BASE}/latin-300-normal.ttf`, fontWeight: 300 },
      {
        src: `${FRAUNCES_BASE}/latin-400-italic.ttf`,
        fontWeight: 400,
        fontStyle: "italic",
      },
    ],
  });

  Font.register({
    family: "Inter",
    fonts: [
      { src: `${INTER_BASE}/latin-400-normal.ttf`, fontWeight: 400 },
      { src: `${INTER_BASE}/latin-500-normal.ttf`, fontWeight: 500 },
      { src: `${INTER_BASE}/latin-600-normal.ttf`, fontWeight: 600 },
    ],
  });
} catch {
  // Fall back to Helvetica/Times in the styles below.
}

const styles = StyleSheet.create({
  page: {
    padding: 56,
    backgroundColor: "#fffbf6",
    fontFamily: "Inter",
    color: "#1f1a17",
  },
  cover: {
    padding: 0,
    backgroundColor: "#fff7f0",
  },
  coverInner: {
    flex: 1,
    padding: 56,
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: "Inter",
    fontSize: 9,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: "#9f1239",
    marginBottom: 18,
  },
  coverTitle: {
    fontFamily: "Fraunces",
    fontWeight: 300,
    fontSize: 56,
    lineHeight: 1.05,
    color: "#1f1a17",
    marginBottom: 14,
  },
  coverSubtitle: {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 18,
    color: "#9f1239",
    marginBottom: 36,
  },
  hairline: {
    height: 1,
    backgroundColor: "#e7d5c3",
    width: 96,
    marginBottom: 36,
  },
  meta: {
    fontFamily: "Inter",
    fontSize: 10,
    color: "#857a74",
    lineHeight: 1.6,
  },
  paletteRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
  },
  paletteSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1e6dc",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1e6dc",
  },
  brandMark: {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontWeight: 300,
    fontSize: 16,
    color: "#9f1239",
  },
  sectionLabel: {
    fontFamily: "Inter",
    fontSize: 9,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#857a74",
  },
  sectionTitle: {
    fontFamily: "Fraunces",
    fontWeight: 300,
    fontSize: 28,
    color: "#1f1a17",
    marginBottom: 18,
  },
  renderImage: {
    width: "100%",
    height: 380,
    objectFit: "cover",
    borderRadius: 8,
  },
  caption: {
    fontFamily: "Inter",
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#857a74",
    marginTop: 12,
  },
  moodboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodboardCell: {
    width: "32%",
    height: 130,
    borderRadius: 6,
    overflow: "hidden",
  },
  moodboardImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  styleNotes: {
    fontFamily: "Fraunces",
    fontStyle: "italic",
    fontSize: 14,
    color: "#3f3a36",
    lineHeight: 1.7,
    marginTop: 36,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#a88a7a",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});

interface MediaItem {
  id: string;
  type: string;
  url: string;
}

interface RefItem {
  id: string;
  url: string;
}

interface DesignDoc {
  name: string;
  event_type: string;
  setting: string;
  size: string;
  palette?: { name?: string; colors: string[] };
  references?: {
    overall_vibe: RefItem[];
    tables: RefItem[];
    flowers: RefItem[];
    lighting: RefItem[];
    venue_decor: RefItem[];
  };
  style_notes?: string | null;
  media: MediaItem[];
}

interface LookbookProps {
  recipientName: string;
  publishedAt: Date | string | null;
  design: DesignDoc;
}

export function LookbookDocument({
  recipientName,
  publishedAt,
  design,
}: LookbookProps): ReactElement<DocumentProps> {
  const palette = design.palette ?? { colors: [] };
  const refs = design.references;
  const flatRefs: RefItem[] = refs
    ? [
        ...refs.overall_vibe,
        ...refs.flowers,
        ...refs.tables,
        ...refs.venue_decor,
        ...refs.lighting,
      ].slice(0, 9)
    : [];
  const renders = design.media.filter((m) => m.type === "render").slice(0, 12);

  const dateLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <Document
      title={`${recipientName} — Wedding Vision`}
      author="Zaffa"
      subject="Wedding Vision Pack"
    >
      {/* ------- Cover ------- */}
      <Page size="A4" style={[styles.page, styles.cover]}>
        <View style={styles.coverInner}>
          <Text style={styles.eyebrow}>Wedding Vision Pack</Text>
          <Text style={styles.coverTitle}>{recipientName}</Text>
          <Text style={styles.coverSubtitle}>
            {design.name || "A wedding, visualized"}
          </Text>
          <View style={styles.hairline} />
          <Text style={styles.meta}>
            {design.event_type
              ? `${capitalize(design.event_type)} · ${capitalize(design.setting)} · ${capitalize(design.size)}`
              : "A complete wedding vision"}
            {dateLabel ? `\nPrinted ${dateLabel}` : ""}
          </Text>
          {palette.colors.length > 0 && (
            <View style={styles.paletteRow}>
              {palette.colors.slice(0, 6).map((c, i) => (
                <View
                  key={`${c}-${i}`}
                  style={[styles.paletteSwatch, { backgroundColor: c }]}
                />
              ))}
            </View>
          )}
        </View>
        <View style={styles.footer}>
          <Text>Zaffa</Text>
          <Text>Cairo, Egypt</Text>
        </View>
      </Page>

      {/* ------- Mood board ------- */}
      {flatRefs.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.pageHeader}>
            <Text style={styles.brandMark}>Zaffa</Text>
            <Text style={styles.sectionLabel}>Mood board</Text>
          </View>
          <Text style={styles.sectionTitle}>The references</Text>
          <View style={styles.moodboardGrid}>
            {flatRefs.map((r) => (
              <View key={r.id} style={styles.moodboardCell}>
                <Image src={r.url} style={styles.moodboardImage} />
              </View>
            ))}
          </View>
          {design.style_notes ? (
            <Text style={styles.styleNotes}>{`\u201C${design.style_notes}\u201D`}</Text>
          ) : null}
          <View style={styles.footer}>
            <Text>Wedding Vision Pack</Text>
            <Text>{recipientName}</Text>
          </View>
        </Page>
      )}

      {/* ------- Render pages (one render per page) ------- */}
      {renders.map((r, i) => (
        <Page key={r.id} size="A4" style={styles.page}>
          <View style={styles.pageHeader}>
            <Text style={styles.brandMark}>Zaffa</Text>
            <Text style={styles.sectionLabel}>
              Render {String(i + 1).padStart(2, "0")} / {String(renders.length).padStart(2, "0")}
            </Text>
          </View>
          <Image src={r.url} style={styles.renderImage} />
          <Text style={styles.caption}>
            {capitalize(design.setting)} · {capitalize(design.size)}
          </Text>
          <View style={styles.footer}>
            <Text>Wedding Vision Pack</Text>
            <Text>{recipientName}</Text>
          </View>
        </Page>
      ))}

      {/* ------- Closing ------- */}
      <Page size="A4" style={[styles.page, styles.cover]}>
        <View style={styles.coverInner}>
          <Text style={styles.eyebrow}>Made with Zaffa</Text>
          <Text
            style={[
              styles.coverTitle,
              { fontSize: 36, lineHeight: 1.15, marginBottom: 18 },
            ]}
          >
            Your wedding,{"\n"}visualized.
          </Text>
          <View style={styles.hairline} />
          <Text style={styles.meta}>
            zaffa.ai{"\n"}Cairo, Egypt
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
