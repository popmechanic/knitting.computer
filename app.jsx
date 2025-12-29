import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFireproof } from "use-fireproof";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const GENDERS = ["Women", "Men", "Unisex"];
const STYLES = ["Minimalist", "Chunky", "Vintage", "Nordic", "Experimental", "Classic", "Bohemian", "Athleisure"];

const SYSTEM_PROMPT = `You are a professional sweater pattern designer creating production-ready patterns. Generate 1 complete sweater pattern based on the user's specifications.

Each pattern MUST include ALL of these sections with full technical detail:

1. PATTERN OVERVIEW
- Name, style keywords, difficulty (beginner/intermediate/advanced), construction type (top-down raglan, bottom-up seamed, circular yoke, drop shoulder, set-in sleeve, etc.)

2. SIZES
- Sizes offered (XS, S, M, L, XL, XXL with corresponding bust/chest measurements)
- Finished measurements for the requested size: chest circumference, body length, sleeve length, upper arm circumference
- Ease recommendation (e.g., "2-4 inches positive ease recommended")

3. GAUGE
- Stitches per 4 inches/10cm AND rows per 4 inches/10cm
- Specify the stitch pattern used for gauge (stockinette, pattern stitch, etc.)
- Flat or in-the-round
- Blocked or unblocked

4. YARN
- Weight category (Lace/Fingering/Sport/DK/Worsted/Aran/Bulky/Super Bulky)
- Fiber suggestion with reasoning
- Specific yardage needed for the requested size (in yards AND meters)

5. NEEDLES & NOTIONS
- Main needle size (US and metric) for body
- Ribbing needle size (typically 1-2 sizes smaller)
- Circular needle lengths needed, and/or DPNs
- Number of stitch markers needed
- Other notions: tapestry needle, waste yarn, cable needle if needed, etc.

6. ABBREVIATIONS
- List all abbreviations used in the pattern using CYC-standard format
- Include a mini key for any nonstandard abbreviations

7. INSTRUCTIONS
- Step-by-step sections with round/row numbering
- Include stitch counts at key points (after increases, at armhole division, etc.)
- Clear repeat logic using standard notation like [k2, p2] x 10
- Specific measurements for "work even until piece measures X inches/cm"
- Sections: Cast On & Ribbing, Body/Yoke, Armhole Shaping (if applicable), Sleeves, Neckline, Finishing

8. FINISHING & BLOCKING
- Seaming instructions if any pieces are worked flat
- Weave-in guidance
- Blocking instructions matched to the fiber suggestion (wet block, steam, etc.)
- Final measurements to block to

9. CUSTOMIZATION NOTES
- 2-3 specific modifications the knitter can make:
  - Body length adjustment
  - Waist shaping option (if not included)
  - Neckline variant (crew vs V vs boat)
  - Sleeve length/taper options

Be extremely specific and technical. Every instruction should be actionable. Use standard knitting abbreviations. This pattern should be complete enough that an experienced knitter could make the sweater without additional resources.

Respond with valid JSON array of patterns:
[{
  "name": "Pattern Name",
  "overview": {
    "style": "style keywords",
    "difficulty": "beginner/intermediate/advanced",
    "construction": "construction method description"
  },
  "sizes": {
    "available": "XS (30\\"), S (34\\"), M (38\\"), L (42\\"), XL (46\\"), XXL (50\\")",
    "finishedMeasurements": {
      "chest": "X inches",
      "bodyLength": "X inches",
      "sleeveLength": "X inches",
      "upperArm": "X inches"
    },
    "ease": "ease recommendation"
  },
  "gauge": {
    "stitches": "X sts per 4 inches",
    "rows": "X rows per 4 inches",
    "pattern": "stockinette/pattern stitch",
    "method": "in the round, blocked"
  },
  "yarn": {
    "weight": "DK/Worsted/etc",
    "fiber": "fiber recommendation and why",
    "yardage": "X yards (X meters)"
  },
  "needles": {
    "main": "US X (X mm)",
    "ribbing": "US X (X mm)",
    "type": "32\\" circular for body, 16\\" circular or DPNs for sleeves",
    "notions": "X stitch markers, tapestry needle, waste yarn"
  },
  "abbreviations": "k=knit, p=purl, k2tog=knit 2 together, ssk=slip slip knit, pm=place marker, sm=slip marker, etc.",
  "instructions": {
    "castOn": "Detailed cast on and ribbing instructions with stitch counts",
    "body": "Body instructions with row/round numbers and stitch counts",
    "sleeves": "Sleeve instructions",
    "neckline": "Neckline shaping",
    "finishing": "Final assembly steps"
  },
  "blocking": "Complete blocking and finishing instructions",
  "customization": ["Modification 1", "Modification 2", "Modification 3"]
}]`;

function ImageThumbnail({ src, alt, onExpand }) {
  return (
    <button
      type="button"
      className="relative cursor-pointer group w-full h-full min-h-[160px]"
      onClick={() => onExpand(src, alt)}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain p-2"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-end justify-center pb-2">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white bg-black/60 px-2 py-0.5 rounded text-xs">
          View larger
        </span>
      </div>
    </button>
  );
}

function Lightbox({ src, alt, onClose }) {
  if (!src) return null;

  // Use portal to render directly into document.body, bypassing any container transforms
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        style={{ position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
            borderRadius: '0.5rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            width: '40px',
            height: '40px',
            backgroundColor: 'white',
            borderRadius: '50%',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#666',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>
    </div>,
    document.body
  );
}

function YarnSpinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-[oklch(0.65_0.12_290)] border-t-transparent animate-spin" />
        <div className="absolute inset-2 rounded-full bg-[oklch(0.92_0.04_50)]" />
        <div className="absolute inset-4 rounded-full bg-[oklch(0.65_0.12_290)]" />
      </div>
      <p className="text-[oklch(0.55_0.08_350)] text-sm animate-pulse">Winding up your patterns...</p>
    </div>
  );
}

function PatternCard({ pattern, index, onImageExpand }) {
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    sizes: false,
    gauge: false,
    yarn: false,
    needles: false,
    abbreviations: false,
    instructions: false,
    blocking: false,
    customization: false
  });

  const colors = [
    "oklch(0.60_0.12_350)", // dusty rose
    "oklch(0.60_0.12_290)", // lavender
    "oklch(0.55_0.08_30)", // warm mauve
  ];
  const accentColor = colors[index % colors.length];

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const expandAll = () => {
    const allExpanded = {};
    Object.keys(expandedSections).forEach(k => allExpanded[k] = true);
    setExpandedSections(allExpanded);
  };

  const collapseAll = () => {
    const allCollapsed = {};
    Object.keys(expandedSections).forEach(k => allCollapsed[k] = false);
    setExpandedSections(allCollapsed);
  };

  return (
    <div className="bg-[oklch(0.99_0.02_50)] rounded-2xl shadow-lg overflow-hidden border border-[oklch(0.92_0.04_350)]">
      <div className="h-2" style={{ backgroundColor: accentColor }} />

      {/* Header with Image and Title side by side */}
      <div className="flex">
        {/* Image on left */}
        {pattern.imageUrl && (
          <div className="flex-shrink-0 w-48">
            <ImageThumbnail src={pattern.imageUrl} alt={pattern.name} onExpand={onImageExpand} />
          </div>
        )}

        {/* Title and info on right */}
        <div className="flex-1 p-5 flex flex-col justify-center">
          <h3 className="text-2xl font-bold mb-2" style={{ color: accentColor }}>
            {pattern.name}
          </h3>
          {pattern.overview && (
            <div className="flex flex-wrap gap-2 text-xs mb-3">
              <span className="px-2 py-1 rounded-full bg-[oklch(0.94_0.04_350)] text-[oklch(0.45_0.08_350)]">
                {pattern.overview.difficulty}
              </span>
              <span className="px-2 py-1 rounded-full bg-[oklch(0.94_0.04_350)] text-[oklch(0.45_0.08_350)]">
                {pattern.overview.construction}
              </span>
              {pattern.overview.style && (
                <span className="px-2 py-1 rounded-full bg-[oklch(0.94_0.04_350)] text-[oklch(0.45_0.08_350)]">
                  {pattern.overview.style}
                </span>
              )}
            </div>
          )}
          {pattern.yarn && (
            <p className="text-sm text-[oklch(0.45_0.04_350)] mb-3">
              <span className="font-medium">{pattern.yarn.weight}</span> · {pattern.yarn.fiber}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-xs text-[oklch(0.55_0.12_290)] hover:underline">
              Expand all
            </button>
            <span className="text-[oklch(0.80_0.03_350)]">|</span>
            <button onClick={collapseAll} className="text-xs text-[oklch(0.55_0.12_290)] hover:underline">
              Collapse all
            </button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[oklch(0.94_0.03_350)]">
        {/* Sizes */}
        <CollapsibleSection
          title="Sizes & Measurements"
          icon="📏"
          isOpen={expandedSections.sizes}
          onToggle={() => toggleSection('sizes')}
          accentColor={accentColor}
        >
          {pattern.sizes && (
            <div className="space-y-3 text-sm">
              <p><strong>Available:</strong> {pattern.sizes.available}</p>
              <p><strong>Ease:</strong> {pattern.sizes.ease}</p>
              {pattern.sizes.finishedMeasurements && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-[oklch(0.96_0.03_50)] rounded-lg">
                  <div><strong>Chest:</strong> {pattern.sizes.finishedMeasurements.chest}</div>
                  <div><strong>Body Length:</strong> {pattern.sizes.finishedMeasurements.bodyLength}</div>
                  <div><strong>Sleeve Length:</strong> {pattern.sizes.finishedMeasurements.sleeveLength}</div>
                  <div><strong>Upper Arm:</strong> {pattern.sizes.finishedMeasurements.upperArm}</div>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Gauge */}
        <CollapsibleSection
          title="Gauge"
          icon="📐"
          isOpen={expandedSections.gauge}
          onToggle={() => toggleSection('gauge')}
          accentColor={accentColor}
        >
          {pattern.gauge && (
            <div className="space-y-2 text-sm">
              <p><strong>Stitches:</strong> {pattern.gauge.stitches}</p>
              <p><strong>Rows:</strong> {pattern.gauge.rows}</p>
              <p><strong>Pattern:</strong> {pattern.gauge.pattern}</p>
              <p><strong>Method:</strong> {pattern.gauge.method}</p>
            </div>
          )}
        </CollapsibleSection>

        {/* Yarn */}
        <CollapsibleSection
          title="Yarn"
          icon="🧶"
          isOpen={expandedSections.yarn}
          onToggle={() => toggleSection('yarn')}
          accentColor={accentColor}
        >
          {pattern.yarn && (
            <div className="space-y-2 text-sm">
              <p><strong>Weight:</strong> {pattern.yarn.weight}</p>
              <p><strong>Fiber:</strong> {pattern.yarn.fiber}</p>
              <p><strong>Yardage:</strong> {pattern.yarn.yardage}</p>
            </div>
          )}
        </CollapsibleSection>

        {/* Needles & Notions */}
        <CollapsibleSection
          title="Needles & Notions"
          icon="🪡"
          isOpen={expandedSections.needles}
          onToggle={() => toggleSection('needles')}
          accentColor={accentColor}
        >
          {pattern.needles && (
            <div className="space-y-2 text-sm">
              <p><strong>Main:</strong> {pattern.needles.main}</p>
              <p><strong>Ribbing:</strong> {pattern.needles.ribbing}</p>
              <p><strong>Type:</strong> {pattern.needles.type}</p>
              <p><strong>Notions:</strong> {pattern.needles.notions}</p>
            </div>
          )}
        </CollapsibleSection>

        {/* Abbreviations */}
        <CollapsibleSection
          title="Abbreviations"
          icon="📝"
          isOpen={expandedSections.abbreviations}
          onToggle={() => toggleSection('abbreviations')}
          accentColor={accentColor}
        >
          <p className="text-sm text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">
            {pattern.abbreviations}
          </p>
        </CollapsibleSection>

        {/* Instructions */}
        <CollapsibleSection
          title="Instructions"
          icon="📋"
          isOpen={expandedSections.instructions}
          onToggle={() => toggleSection('instructions')}
          accentColor={accentColor}
        >
          {pattern.instructions && (
            <div className="space-y-4 text-sm">
              {pattern.instructions.castOn && (
                <div>
                  <h5 className="font-semibold text-[oklch(0.35_0.05_30)] mb-1">Cast On & Ribbing</h5>
                  <p className="text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">{pattern.instructions.castOn}</p>
                </div>
              )}
              {pattern.instructions.body && (
                <div>
                  <h5 className="font-semibold text-[oklch(0.35_0.05_30)] mb-1">Body</h5>
                  <p className="text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">{pattern.instructions.body}</p>
                </div>
              )}
              {pattern.instructions.sleeves && (
                <div>
                  <h5 className="font-semibold text-[oklch(0.35_0.05_30)] mb-1">Sleeves</h5>
                  <p className="text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">{pattern.instructions.sleeves}</p>
                </div>
              )}
              {pattern.instructions.neckline && (
                <div>
                  <h5 className="font-semibold text-[oklch(0.35_0.05_30)] mb-1">Neckline</h5>
                  <p className="text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">{pattern.instructions.neckline}</p>
                </div>
              )}
              {pattern.instructions.finishing && (
                <div>
                  <h5 className="font-semibold text-[oklch(0.35_0.05_30)] mb-1">Finishing</h5>
                  <p className="text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">{pattern.instructions.finishing}</p>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Blocking */}
        <CollapsibleSection
          title="Finishing & Blocking"
          icon="✨"
          isOpen={expandedSections.blocking}
          onToggle={() => toggleSection('blocking')}
          accentColor={accentColor}
        >
          <p className="text-sm text-[oklch(0.40_0.02_30)] whitespace-pre-wrap">
            {pattern.blocking}
          </p>
        </CollapsibleSection>

        {/* Customization */}
        <CollapsibleSection
          title="Customization Notes"
          icon="💡"
          isOpen={expandedSections.customization}
          onToggle={() => toggleSection('customization')}
          accentColor={accentColor}
        >
          {pattern.customization && Array.isArray(pattern.customization) && (
            <ul className="list-disc list-inside space-y-1 text-sm text-[oklch(0.40_0.02_30)]">
              {pattern.customization.map((mod, i) => (
                <li key={i}>{mod}</li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, isOpen, onToggle, children, accentColor }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[oklch(0.97_0.03_350)] transition-colors"
      >
        <span className="flex items-center gap-2 font-medium text-[oklch(0.40_0.06_350)]">
          <span>{icon}</span>
          {title}
        </span>
        <span className="text-[oklch(0.60_0.10_290)] text-lg">
          {isOpen ? '−' : '+'}
        </span>
      </button>
      {isOpen && (
        <div className="px-6 pb-4 text-[oklch(0.40_0.03_350)]">
          {children}
        </div>
      )}
    </div>
  );
}

// API endpoint - uses Cloudflare Worker proxy in production
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'  // Local wrangler dev
  : 'https://knitting-api.marcus-e.workers.dev';  // TODO: change to api.knitting.computer after DNS setup

// Get tenant subdomain for database isolation
function getSubdomain() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    return params.get('subdomain') || 'local';
  }
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts[0];
  }
  return 'default';
}

export default function App() {
  const subdomain = getSubdomain();
  const { useLiveQuery, useDocument, database } = useFireproof(`knitting-${subdomain}`);

  const [gender, setGender] = useState("Women");
  const [size, setSize] = useState("M");
  const [customSize, setCustomSize] = useState("");
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [customRequest, setCustomRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [patterns, setPatterns] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);

  const openLightbox = (src, alt) => setLightboxImage({ src, alt });
  const closeLightbox = () => setLightboxImage(null);

  const toggleStyle = (style) => {
    setSelectedStyles(prev =>
      prev.includes(style)
        ? prev.filter(s => s !== style)
        : [...prev, style]
    );
  };

  const generatePatterns = async () => {
    setLoading(true);
    setError("");
    setPatterns([]);

    const sizeSpec = customSize || size;
    const styleSpec = selectedStyles.length > 0 ? selectedStyles.join(", ") : "any style";

    const customNote = customRequest.trim() ? `\n- Special requests: ${customRequest.trim()}` : "";

    const userPrompt = `Generate sweater patterns for:
- Target: ${gender}
- Size: ${sizeSpec}
- Style preferences: ${styleSpec}${customNote}

Create 1 fully specified pattern that an experienced knitter could start immediately.`;

    try {
      const response = await fetch(`${API_BASE}/api/generate-pattern`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      // Parse the JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedPatterns = JSON.parse(jsonMatch[0]);

        // Generate images for each pattern
        const patternsWithImages = await Promise.all(
          parsedPatterns.map(async (pattern) => {
            try {
              const imagePrompt = `A beautiful hand-knitted sweater: ${pattern.name}. ${pattern.overview?.construction || ''}. Made with ${pattern.yarn?.fiber || 'wool'}. ${pattern.overview?.style || ''} style. Professional product photography on clean background, soft lighting, high quality knitwear.`;

              const imageResponse = await fetch(`${API_BASE}/api/generate-image`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-image",
                  messages: [
                    {
                      role: "user",
                      content: `Generate an image of: ${imagePrompt}`
                    }
                  ],
                }),
              });

              if (imageResponse.ok) {
                const imageData = await imageResponse.json();
                const message = imageData.choices?.[0]?.message;

                // Check for images array (Gemini format)
                if (message?.images?.[0]?.image_url?.url) {
                  return { ...pattern, imageUrl: message.images[0].image_url.url };
                }
              } else {
                console.error("Image API error:", imageResponse.status, await imageResponse.text());
              }
            } catch (imgErr) {
              console.error("Image generation failed:", imgErr);
            }
            return pattern;
          })
        );

        setPatterns(patternsWithImages);

        // Save to Fireproof with images as file attachments
        const _files = {};
        const patternsForStorage = patternsWithImages.map((p, idx) => {
          const { imageUrl, ...rest } = p;
          if (imageUrl && imageUrl.startsWith('data:')) {
            // Convert base64 to Blob/File for Fireproof storage
            const [header, base64] = imageUrl.split(',');
            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mimeType });
            const fileName = `pattern-${idx}.png`;
            _files[fileName] = new File([blob], fileName, { type: mimeType });
            return { ...rest, imageFileName: fileName };
          }
          return rest;
        });

        await database.put({
          type: "generation",
          gender,
          size: sizeSpec,
          styles: selectedStyles,
          patterns: patternsForStorage,
          _files,
          createdAt: new Date().toISOString(),
        });
      } else {
        throw new Error("Could not parse patterns from response");
      }
    } catch (err) {
      setError(err.message || "Failed to generate patterns");
    } finally {
      setLoading(false);
    }
  };

  const { docs: history } = useLiveQuery("type", { key: "generation", descending: true, limit: 5 });

  // Load patterns from history with their file attachments
  const loadFromHistory = async (gen) => {
    try {
      // Get the full document with file attachments
      const doc = await database.get(gen._id);

      // Load images from _files attachments
      const patternsWithImages = await Promise.all(
        (doc.patterns || []).map(async (pattern) => {
          if (pattern.imageFileName && doc._files?.[pattern.imageFileName]?.file) {
            try {
              const fileObj = await doc._files[pattern.imageFileName].file();
              const imageUrl = URL.createObjectURL(fileObj);
              return { ...pattern, imageUrl };
            } catch (e) {
              console.error("Failed to load image file:", e);
            }
          }
          return pattern;
        })
      );

      setPatterns(patternsWithImages);
    } catch (e) {
      console.error("Failed to load from history:", e);
      // Fallback to patterns without images
      setPatterns(gen.patterns || []);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-[oklch(0.97_0.02_350)]">
      {/* Header */}
      <header className="bg-[linear-gradient(180deg_in_oklch,oklch(0.82_0.12_330),oklch(0.88_0.10_10))] pt-8 pb-16 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-4 left-[10%] text-6xl">🧶</div>
          <div className="absolute top-12 right-[15%] text-4xl">🪡</div>
          <div className="absolute bottom-8 left-[20%] text-5xl">🧵</div>
          <div className="absolute bottom-4 right-[10%] text-6xl">🧶</div>
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <img
            src="logo.png"
            alt="The Knitting Computer"
            className="w-44 h-44 object-contain mx-auto mb-3 drop-shadow-lg"
          />
          <h1 className="text-3xl font-bold tracking-tight text-[oklch(0.35_0.12_350)]">The Knitting Computer</h1>
          <p className="text-[oklch(0.45_0.10_350)] text-sm mt-1 font-medium">
            AI-Powered Knitting Pattern Designer
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 -mt-8 relative z-10">
        {/* Input Form */}
        <div className="bg-[oklch(0.99_0.02_50)] rounded-2xl shadow-xl p-6 mb-8 border border-[oklch(0.92_0.04_350)]">
          <h2 className="text-xl font-bold text-[oklch(0.40_0.10_350)] mb-6">
            Design Your Sweater
          </h2>

          {/* Gender & Size Row */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">
                Target Gender
              </label>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      gender === g
                        ? "bg-[oklch(0.60_0.12_350)] text-white"
                        : "bg-[oklch(0.94_0.03_350)] text-[oklch(0.45_0.06_350)] hover:bg-[oklch(0.90_0.05_350)]"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">
                Size
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => { setSize(s); setCustomSize(""); }}
                    className={`w-12 h-10 rounded-lg text-sm font-medium transition-all ${
                      size === s && !customSize
                        ? "bg-[oklch(0.60_0.12_290)] text-white"
                        : "bg-[oklch(0.94_0.03_350)] text-[oklch(0.45_0.06_350)] hover:bg-[oklch(0.90_0.05_350)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                placeholder="Or enter chest measurement (e.g., 38 inches)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[oklch(0.88_0.04_350)] focus:border-[oklch(0.60_0.12_290)] focus:outline-none"
              />
            </div>
          </div>

          {/* Style Preferences */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">
              Style Preferences (optional, select any that appeal)
            </label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map(style => (
                <button
                  key={style}
                  onClick={() => toggleStyle(style)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    selectedStyles.includes(style)
                      ? "bg-[oklch(0.60_0.12_290)] text-white"
                      : "bg-[oklch(0.94_0.03_350)] text-[oklch(0.45_0.06_350)] hover:bg-[oklch(0.90_0.05_350)]"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Request */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">
              Special Requests (optional)
            </label>
            <textarea
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              placeholder="E.g., cropped length, include a hood, colorwork yoke, oversized fit, pockets, split hem, etc."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border-2 border-[oklch(0.90_0.04_350)] focus:border-[oklch(0.60_0.12_350)] focus:outline-none transition-colors bg-[oklch(0.98_0.02_50)] resize-none text-sm"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={generatePatterns}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-[linear-gradient(135deg_in_oklch,oklch(0.60_0.12_350),oklch(0.55_0.12_290))] text-white font-bold text-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? "Designing..." : "🐱 Generate Pattern Ideas"}
          </button>

          {error && (
            <p className="mt-4 text-center text-[oklch(0.55_0.15_25)]">{error}</p>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <YarnSpinner />
          </div>
        )}

        {/* Generated Patterns */}
        {patterns.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-[oklch(0.45_0.10_350)] mb-6 text-center">
              Your Pattern Concepts
            </h2>
            <div className="space-y-6">
              {patterns.map((pattern, idx) => (
                <PatternCard key={idx} pattern={pattern} index={idx} onImageExpand={openLightbox} />
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && patterns.length === 0 && !loading && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-[oklch(0.45_0.08_350)] mb-4">
              Recent Generations
            </h3>
            <div className="space-y-3">
              {history.map(gen => (
                <button
                  key={gen._id}
                  onClick={() => loadFromHistory(gen)}
                  className="w-full text-left p-4 bg-[oklch(0.99_0.02_50)] rounded-xl hover:shadow-md transition-all border border-[oklch(0.92_0.04_350)]"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-[oklch(0.40_0.06_350)]">
                      {gen.gender} • {gen.size} • {gen.styles?.join(", ") || "Any style"}
                    </span>
                    <span className="text-sm text-[oklch(0.60_0.10_290)]">
                      {gen.patterns?.length} patterns
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-[oklch(0.55_0.08_350)]">
        <p>The Knitting Computer — From yarn to needles to finished sweater 🧶</p>
      </footer>
    </div>

    {/* Lightbox rendered outside main container to avoid stacking context issues */}
    {lightboxImage && (
      <Lightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={closeLightbox} />
    )}
    </>
  );
}
