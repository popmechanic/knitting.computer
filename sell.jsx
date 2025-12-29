import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFireproof } from "use-fireproof";

// ============================================
// CONFIGURATION
// ============================================
const CLERK_PUBLISHABLE_KEY = "pk_test_Zml0LWFudGVhdGVyLTY1LmNsZXJrLmFjY291bnRzLmRldiQ";
const ROOT_DOMAIN = "knitting.computer";
const MONTHLY_PRICE = 5;
const YEARLY_PRICE = 50;

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'
  : 'https://knitting-api.marcus-e.workers.dev';

// ============================================
// SUBDOMAIN DETECTION
// ============================================
function getSubdomain() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    return params.get('subdomain') || null;
  }
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) {
    return null;
  }
  const parts = hostname.split('.');
  if (parts.length >= 2 && hostname.endsWith(ROOT_DOMAIN)) {
    return parts[0];
  }
  return null;
}

// ============================================
// CONSTANTS FOR KNITTING APP
// ============================================
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const GENDERS = ["Women", "Men", "Unisex"];
const STYLES = ["Minimalist", "Chunky", "Vintage", "Nordic", "Experimental", "Classic", "Bohemian", "Athleisure"];

const SYSTEM_PROMPT = `You are a professional sweater pattern designer creating production-ready patterns. Generate 1 complete sweater pattern based on the user's specifications.

Each pattern MUST include ALL of these sections with full technical detail:

1. PATTERN OVERVIEW
- Name, style keywords, difficulty (beginner/intermediate/advanced), construction type

2. SIZES
- Sizes offered with measurements
- Finished measurements for the requested size
- Ease recommendation

3. GAUGE
- Stitches and rows per 4 inches
- Pattern used for gauge
- Method (flat/in-the-round, blocked/unblocked)

4. YARN
- Weight category
- Fiber suggestion with reasoning
- Specific yardage needed

5. NEEDLES & NOTIONS
- Main and ribbing needle sizes
- Circular needle lengths and/or DPNs
- Stitch markers and other notions

6. ABBREVIATIONS
- All abbreviations used

7. INSTRUCTIONS
- Step-by-step with row/round numbering
- Stitch counts at key points
- Sections: Cast On, Body/Yoke, Sleeves, Neckline, Finishing

8. FINISHING & BLOCKING
- Seaming, weave-in, blocking instructions

9. CUSTOMIZATION NOTES
- 2-3 modifications the knitter can make

Respond with valid JSON array of patterns:
[{
  "name": "Pattern Name",
  "overview": { "style": "...", "difficulty": "...", "construction": "..." },
  "sizes": { "available": "...", "finishedMeasurements": { "chest": "...", "bodyLength": "...", "sleeveLength": "...", "upperArm": "..." }, "ease": "..." },
  "gauge": { "stitches": "...", "rows": "...", "pattern": "...", "method": "..." },
  "yarn": { "weight": "...", "fiber": "...", "yardage": "..." },
  "needles": { "main": "...", "ribbing": "...", "type": "...", "notions": "..." },
  "abbreviations": "...",
  "instructions": { "castOn": "...", "body": "...", "sleeves": "...", "neckline": "...", "finishing": "..." },
  "blocking": "...",
  "customization": ["...", "...", "..."]
}]`;

// ============================================
// SHARED COMPONENTS
// ============================================
function Lightbox({ src, alt, onClose }) {
  if (!src) return null;
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '0.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} />
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: '-12px', right: '-12px', width: '40px', height: '40px', backgroundColor: 'white', borderRadius: '50%', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#666', cursor: 'pointer' }}>✕</button>
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

function ImageThumbnail({ src, alt, onExpand }) {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onExpand(src, alt);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="relative cursor-pointer group w-full h-full min-h-[160px]"
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e)}
    >
      <img src={src} alt={alt} className="w-full h-full object-contain p-2" draggable={false} />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-end justify-center pb-2">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white bg-black/60 px-2 py-0.5 rounded text-xs">View larger</span>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, isOpen, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} className="w-full px-6 py-4 flex items-center justify-between hover:bg-[oklch(0.97_0.03_350)] transition-colors">
        <span className="flex items-center gap-2 font-medium text-[oklch(0.40_0.06_350)]"><span>{icon}</span>{title}</span>
        <span className="text-[oklch(0.60_0.10_290)] text-lg">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="px-6 pb-4 text-[oklch(0.40_0.03_350)]">{children}</div>}
    </div>
  );
}

function PatternCard({ pattern, index, onImageExpand }) {
  const [expandedSections, setExpandedSections] = useState({ overview: true, sizes: false, gauge: false, yarn: false, needles: false, abbreviations: false, instructions: false, blocking: false, customization: false });
  const colors = ["oklch(0.60_0.12_350)", "oklch(0.60_0.12_290)", "oklch(0.55_0.08_30)"];
  const accentColor = colors[index % colors.length];
  const toggleSection = (s) => setExpandedSections(prev => ({ ...prev, [s]: !prev[s] }));

  return (
    <div className="bg-[oklch(0.99_0.02_50)] rounded-2xl shadow-lg overflow-hidden border border-[oklch(0.92_0.04_350)]">
      <div className="h-2" style={{ backgroundColor: accentColor }} />
      <div className="flex">
        {pattern.imageUrl && <div className="flex-shrink-0 w-48"><ImageThumbnail src={pattern.imageUrl} alt={pattern.name} onExpand={onImageExpand} /></div>}
        <div className="flex-1 p-5 flex flex-col justify-center">
          <h3 className="text-2xl font-bold mb-2" style={{ color: accentColor }}>{pattern.name}</h3>
          {pattern.overview && (
            <div className="flex flex-wrap gap-2 text-xs mb-3">
              <span className="px-2 py-1 rounded-full bg-[oklch(0.94_0.04_350)] text-[oklch(0.45_0.08_350)]">{pattern.overview.difficulty}</span>
              <span className="px-2 py-1 rounded-full bg-[oklch(0.94_0.04_350)] text-[oklch(0.45_0.08_350)]">{pattern.overview.construction}</span>
            </div>
          )}
          {pattern.yarn && <p className="text-sm text-[oklch(0.45_0.04_350)] mb-3"><span className="font-medium">{pattern.yarn.weight}</span> · {pattern.yarn.fiber}</p>}
        </div>
      </div>
      <div className="divide-y divide-[oklch(0.94_0.03_350)]">
        <CollapsibleSection title="Sizes & Measurements" icon="📏" isOpen={expandedSections.sizes} onToggle={() => toggleSection('sizes')}>
          {pattern.sizes && <div className="space-y-2 text-sm"><p><strong>Available:</strong> {pattern.sizes.available}</p><p><strong>Ease:</strong> {pattern.sizes.ease}</p></div>}
        </CollapsibleSection>
        <CollapsibleSection title="Gauge" icon="📐" isOpen={expandedSections.gauge} onToggle={() => toggleSection('gauge')}>
          {pattern.gauge && <div className="space-y-2 text-sm"><p><strong>Stitches:</strong> {pattern.gauge.stitches}</p><p><strong>Rows:</strong> {pattern.gauge.rows}</p></div>}
        </CollapsibleSection>
        <CollapsibleSection title="Yarn" icon="🧶" isOpen={expandedSections.yarn} onToggle={() => toggleSection('yarn')}>
          {pattern.yarn && <div className="space-y-2 text-sm"><p><strong>Weight:</strong> {pattern.yarn.weight}</p><p><strong>Yardage:</strong> {pattern.yarn.yardage}</p></div>}
        </CollapsibleSection>
        <CollapsibleSection title="Needles & Notions" icon="🪡" isOpen={expandedSections.needles} onToggle={() => toggleSection('needles')}>
          {pattern.needles && <div className="space-y-2 text-sm"><p><strong>Main:</strong> {pattern.needles.main}</p><p><strong>Notions:</strong> {pattern.needles.notions}</p></div>}
        </CollapsibleSection>
        <CollapsibleSection title="Instructions" icon="📋" isOpen={expandedSections.instructions} onToggle={() => toggleSection('instructions')}>
          {pattern.instructions && <div className="space-y-4 text-sm whitespace-pre-wrap">{pattern.instructions.castOn && <div><h5 className="font-semibold">Cast On</h5><p>{pattern.instructions.castOn}</p></div>}{pattern.instructions.body && <div><h5 className="font-semibold">Body</h5><p>{pattern.instructions.body}</p></div>}{pattern.instructions.sleeves && <div><h5 className="font-semibold">Sleeves</h5><p>{pattern.instructions.sleeves}</p></div>}</div>}
        </CollapsibleSection>
        <CollapsibleSection title="Customization" icon="💡" isOpen={expandedSections.customization} onToggle={() => toggleSection('customization')}>
          {pattern.customization && <ul className="list-disc list-inside text-sm">{pattern.customization.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </CollapsibleSection>
      </div>
    </div>
  );
}

// ============================================
// KNITTING APP (TENANT)
// ============================================
function KnittingApp({ subdomain }) {
  const { useLiveQuery, database } = useFireproof(`knitting-${subdomain}`);
  const [gender, setGender] = useState("Women");
  const [size, setSize] = useState("M");
  const [customSize, setCustomSize] = useState("");
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [customRequest, setCustomRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [patterns, setPatterns] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);

  const toggleStyle = (style) => setSelectedStyles(prev => prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]);

  const generatePatterns = async () => {
    setLoading(true);
    setError("");
    setPatterns([]);
    const sizeSpec = customSize || size;
    const styleSpec = selectedStyles.length > 0 ? selectedStyles.join(", ") : "any style";
    const customNote = customRequest.trim() ? `\n- Special requests: ${customRequest.trim()}` : "";
    const userPrompt = `Generate sweater patterns for:\n- Target: ${gender}\n- Size: ${sizeSpec}\n- Style preferences: ${styleSpec}${customNote}\n\nCreate 1 fully specified pattern.`;

    try {
      const response = await fetch(`${API_BASE}/api/generate-pattern`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "anthropic/claude-sonnet-4", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }], temperature: 0.8 }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedPatterns = JSON.parse(jsonMatch[0]);
        const patternsWithImages = await Promise.all(parsedPatterns.map(async (pattern) => {
          try {
            const imagePrompt = `A beautiful hand-knitted sweater: ${pattern.name}. ${pattern.overview?.construction || ''}. Made with ${pattern.yarn?.fiber || 'wool'}. Professional product photography.`;
            const imageResponse = await fetch(`${API_BASE}/api/generate-image`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: "google/gemini-2.5-flash-image", messages: [{ role: "user", content: `Generate an image of: ${imagePrompt}` }] }),
            });
            if (imageResponse.ok) {
              const imageData = await imageResponse.json();
              if (imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
                return { ...pattern, imageUrl: imageData.choices[0].message.images[0].image_url.url };
              }
            }
          } catch (e) { console.error("Image failed:", e); }
          return pattern;
        }));
        setPatterns(patternsWithImages);
        await database.put({ type: "generation", gender, size: sizeSpec, styles: selectedStyles, patterns: patternsWithImages.map(({ imageUrl, ...rest }) => rest), createdAt: new Date().toISOString() });
      }
    } catch (err) {
      setError(err.message || "Failed to generate patterns");
    } finally {
      setLoading(false);
    }
  };

  const { docs: history } = useLiveQuery("type", { key: "generation", descending: true, limit: 5 });

  return (
    <>
      <div className="min-h-screen bg-[oklch(0.97_0.02_350)]">
        <header className="bg-[linear-gradient(180deg_in_oklch,oklch(0.82_0.12_330),oklch(0.88_0.10_10))] pt-8 pb-16 px-4 relative overflow-hidden">
          <div className="max-w-4xl mx-auto text-center relative">
            <img src="logo.png" alt="The Knitting Computer" className="w-32 h-32 object-contain mx-auto mb-3 drop-shadow-lg" />
            <h1 className="text-3xl font-bold tracking-tight text-[oklch(0.35_0.12_350)]">The Knitting Computer</h1>
            <p className="text-[oklch(0.45_0.10_350)] text-sm mt-1">{subdomain}'s Studio</p>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 -mt-8 relative z-10">
          <div className="bg-[oklch(0.99_0.02_50)] rounded-2xl shadow-xl p-6 mb-8 border border-[oklch(0.92_0.04_350)]">
            <h2 className="text-xl font-bold text-[oklch(0.40_0.10_350)] mb-6">Design Your Sweater</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">Target Gender</label>
                <div className="flex flex-wrap gap-2">
                  {GENDERS.map(g => <button key={g} onClick={() => setGender(g)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${gender === g ? "bg-[oklch(0.60_0.12_350)] text-white" : "bg-[oklch(0.94_0.03_350)] text-[oklch(0.45_0.06_350)]"}`}>{g}</button>)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">Size</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {SIZES.map(s => <button key={s} onClick={() => { setSize(s); setCustomSize(""); }} className={`w-12 h-10 rounded-lg text-sm font-medium transition-all ${size === s && !customSize ? "bg-[oklch(0.60_0.12_290)] text-white" : "bg-[oklch(0.94_0.03_350)] text-[oklch(0.45_0.06_350)]"}`}>{s}</button>)}
                </div>
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">Style Preferences</label>
              <div className="flex flex-wrap gap-2">
                {STYLES.map(style => <button key={style} onClick={() => toggleStyle(style)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedStyles.includes(style) ? "bg-[oklch(0.60_0.12_290)] text-white" : "bg-[oklch(0.94_0.03_350)] text-[oklch(0.45_0.06_350)]"}`}>{style}</button>)}
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-[oklch(0.45_0.06_350)] mb-2">Special Requests</label>
              <textarea value={customRequest} onChange={(e) => setCustomRequest(e.target.value)} placeholder="E.g., cropped length, hood, colorwork yoke..." rows={2} className="w-full px-4 py-3 rounded-xl border-2 border-[oklch(0.90_0.04_350)] focus:border-[oklch(0.60_0.12_350)] focus:outline-none text-sm" />
            </div>
            <button onClick={generatePatterns} disabled={loading} className="w-full py-4 rounded-xl bg-[linear-gradient(135deg_in_oklch,oklch(0.60_0.12_350),oklch(0.55_0.12_290))] text-white font-bold text-lg hover:opacity-90 disabled:opacity-50 shadow-lg">
              {loading ? "Designing..." : "🧶 Generate Pattern"}
            </button>
            {error && <p className="mt-4 text-center text-red-500">{error}</p>}
          </div>
          {loading && <div className="flex justify-center py-12"><YarnSpinner /></div>}
          {patterns.length > 0 && <div className="space-y-6">{patterns.map((pattern, idx) => <PatternCard key={idx} pattern={pattern} index={idx} onImageExpand={(src, alt) => setLightboxImage({ src, alt })} />)}</div>}
          {history.length > 0 && patterns.length === 0 && !loading && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-[oklch(0.45_0.08_350)] mb-4">Recent Generations</h3>
              <div className="space-y-3">{history.map(gen => <button key={gen._id} onClick={() => setPatterns(gen.patterns || [])} className="w-full text-left p-4 bg-[oklch(0.99_0.02_50)] rounded-xl hover:shadow-md border border-[oklch(0.92_0.04_350)]"><span className="font-medium text-[oklch(0.40_0.06_350)]">{gen.gender} • {gen.size}</span></button>)}</div>
            </div>
          )}
        </main>
      </div>
      {lightboxImage && <Lightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />}
    </>
  );
}

// ============================================
// LANDING PAGE
// ============================================
function LandingPage() {
  const [subdomain, setSubdomain] = useState("");
  const [isValid, setIsValid] = useState(false);

  const validateSubdomain = (value) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(cleaned);
    setIsValid(cleaned.length >= 3 && cleaned.length <= 30 && /^[a-z]/.test(cleaned));
  };

  const handleClaim = () => {
    if (isValid) window.location.href = `https://${subdomain}.${ROOT_DOMAIN}`;
  };

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.02_350)]">
      <header className="bg-[linear-gradient(180deg_in_oklch,oklch(0.82_0.12_330),oklch(0.88_0.10_10))] pt-12 pb-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-4 left-[10%] text-6xl">🧶</div>
          <div className="absolute top-12 right-[15%] text-4xl">🪡</div>
          <div className="absolute bottom-8 left-[20%] text-5xl">🧵</div>
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <img src="logo.png" alt="The Knitting Computer" className="w-32 h-32 object-contain mx-auto mb-4 drop-shadow-lg" />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[oklch(0.35_0.12_350)] mb-4">The Knitting Computer</h1>
          <p className="text-xl text-[oklch(0.45_0.10_350)] mb-8 max-w-2xl mx-auto">AI-powered knitting pattern designer. Generate complete, production-ready sweater patterns.</p>
          <div className="bg-white/80 backdrop-blur rounded-2xl p-6 max-w-md mx-auto shadow-xl border border-[oklch(0.92_0.04_350)]">
            <label className="block text-sm font-medium text-[oklch(0.40_0.08_350)] mb-2">Claim your knitting studio</label>
            <div className="flex items-stretch mb-4">
              <input type="text" value={subdomain} onChange={(e) => validateSubdomain(e.target.value)} placeholder="yourname" className="min-w-0 flex-1 px-4 py-3 rounded-l-xl border-2 border-r-0 border-[oklch(0.88_0.04_350)] focus:border-[oklch(0.60_0.12_350)] focus:outline-none text-base leading-6" />
              <span className="shrink-0 flex items-center px-3 py-3 bg-[oklch(0.94_0.03_350)] rounded-r-xl border-2 border-l-0 border-[oklch(0.88_0.04_350)] text-[oklch(0.50_0.06_350)] text-sm leading-6 whitespace-nowrap">.{ROOT_DOMAIN}</span>
            </div>
            <button onClick={handleClaim} disabled={!isValid} className="w-full py-3 rounded-xl bg-[linear-gradient(135deg_in_oklch,oklch(0.60_0.12_350),oklch(0.55_0.12_290))] text-white font-bold text-lg hover:opacity-90 disabled:opacity-50">Get Started Free</button>
          </div>
        </div>
      </header>
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-[oklch(0.40_0.10_350)] mb-12">Everything You Need to Design Sweaters</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
              <div className="text-4xl mb-4">🎨</div>
              <h3 className="text-xl font-bold text-[oklch(0.40_0.10_350)] mb-2">AI Pattern Generation</h3>
              <p className="text-[oklch(0.55_0.08_350)]">Complete patterns with gauge, sizing, and instructions.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
              <div className="text-4xl mb-4">🖼️</div>
              <h3 className="text-xl font-bold text-[oklch(0.40_0.10_350)] mb-2">Visual Previews</h3>
              <p className="text-[oklch(0.55_0.08_350)]">AI-generated images of your designs before knitting.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
              <div className="text-4xl mb-4">📚</div>
              <h3 className="text-xl font-bold text-[oklch(0.40_0.10_350)] mb-2">Pattern Library</h3>
              <p className="text-[oklch(0.55_0.08_350)]">Save and organize all your patterns.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="py-16 px-4 bg-[oklch(0.95_0.03_350)]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-[oklch(0.40_0.10_350)] mb-4">Simple Pricing</h2>
          <p className="text-[oklch(0.55_0.08_350)] mb-12">Start free, upgrade when you're ready</p>
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
              <h3 className="text-xl font-bold text-[oklch(0.40_0.10_350)] mb-2">Monthly</h3>
              <div className="mb-4"><span className="text-4xl font-bold">${MONTHLY_PRICE}</span><span className="text-[oklch(0.55_0.08_350)]">/month</span></div>
              <ul className="space-y-2 mb-6 text-left">{["Unlimited patterns", "AI image previews", "Pattern library"].map((f, i) => <li key={i} className="flex items-center gap-2"><span>✓</span><span className="text-[oklch(0.50_0.06_350)]">{f}</span></li>)}</ul>
              <button className="w-full py-2 rounded-xl bg-[oklch(0.60_0.12_350)] text-white font-medium">Get Started</button>
            </div>
            <div className="bg-[oklch(0.60_0.12_350)] rounded-2xl p-6 shadow-xl scale-105 text-white">
              <h3 className="text-xl font-bold mb-2">Yearly</h3>
              <div className="mb-4"><span className="text-4xl font-bold">${YEARLY_PRICE}</span><span className="text-white/80">/year</span></div>
              <ul className="space-y-2 mb-6 text-left">{["Everything in Monthly", "Save 17%", "Priority support"].map((f, i) => <li key={i} className="flex items-center gap-2"><span>✓</span><span className="text-white/90">{f}</span></li>)}</ul>
              <button className="w-full py-2 rounded-xl bg-white text-[oklch(0.60_0.12_350)] font-medium">Get Started</button>
            </div>
          </div>
        </div>
      </section>
      <footer className="py-8 px-4 text-center text-sm text-[oklch(0.55_0.08_350)]">
        <p>The Knitting Computer — From yarn to needles to finished sweater 🧶</p>
      </footer>
    </div>
  );
}

// ============================================
// AUTH WRAPPER
// ============================================
function TenantWithAuth({ subdomain }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkPublishableKey = CLERK_PUBLISHABLE_KEY;
    script.onload = async () => {
      // Wait for Clerk to be ready
      if (!window.Clerk.loaded) {
        await window.Clerk.load();
      }
      setUser(window.Clerk.user);
      setLoading(false);
      window.Clerk.addListener(() => setUser(window.Clerk.user));
    };
    document.head.appendChild(script);
  }, []);

  if (loading) return <div className="min-h-screen bg-[oklch(0.97_0.02_350)] flex items-center justify-center"><YarnSpinner /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[oklch(0.97_0.02_350)] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-[oklch(0.92_0.04_350)] max-w-md w-full text-center">
          <img src="logo.png" alt="The Knitting Computer" className="w-24 h-24 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[oklch(0.40_0.10_350)] mb-2">Welcome to {subdomain}'s Studio</h1>
          <p className="text-[oklch(0.55_0.08_350)] mb-6">Sign in to access your knitting pattern designer</p>
          <button onClick={() => window.Clerk.openSignIn({ forceRedirectUrl: window.location.href })} className="w-full py-3 rounded-xl bg-[linear-gradient(135deg_in_oklch,oklch(0.60_0.12_350),oklch(0.55_0.12_290))] text-white font-bold text-lg hover:opacity-90">Sign In</button>
          <p className="mt-4 text-sm text-[oklch(0.60_0.08_350)]">Don't have an account? <button onClick={() => window.Clerk.openSignUp({ forceRedirectUrl: window.location.href })} className="text-[oklch(0.55_0.12_290)] hover:underline">Sign up</button></p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-50">
        <button onClick={() => window.Clerk.openUserProfile()} className="flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-md border border-[oklch(0.92_0.04_350)]">
          <img src={user.imageUrl} alt={user.firstName} className="w-8 h-8 rounded-full" />
          <span className="text-sm font-medium text-[oklch(0.40_0.08_350)]">{user.firstName}</span>
        </button>
      </div>
      <KnittingApp subdomain={subdomain} />
    </div>
  );
}

// ============================================
// ADMIN DASHBOARD
// ============================================
const ADMIN_EMAILS = ["marcus@estes.dev"]; // Add your admin emails here

function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { useLiveQuery, database } = useFireproof("knitting-admin");
  const { docs: tenants } = useLiveQuery("type", { key: "tenant" });

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkPublishableKey = CLERK_PUBLISHABLE_KEY;
    script.onload = async () => {
      if (!window.Clerk.loaded) await window.Clerk.load();
      setUser(window.Clerk.user);
      setLoading(false);
      window.Clerk.addListener(() => setUser(window.Clerk.user));
    };
    document.head.appendChild(script);
  }, []);

  if (loading) return <div className="min-h-screen bg-[oklch(0.97_0.02_350)] flex items-center justify-center"><YarnSpinner /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[oklch(0.97_0.02_350)] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-[oklch(0.92_0.04_350)] max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-[oklch(0.40_0.10_350)] mb-2">Admin Access</h1>
          <p className="text-[oklch(0.55_0.08_350)] mb-6">Sign in to access the admin dashboard</p>
          <button onClick={() => window.Clerk.openSignIn({ forceRedirectUrl: window.location.href })} className="w-full py-3 rounded-xl bg-[oklch(0.40_0.08_350)] text-white font-bold text-lg hover:opacity-90">Sign In</button>
        </div>
      </div>
    );
  }

  const isAdmin = ADMIN_EMAILS.includes(user.primaryEmailAddress?.emailAddress);
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[oklch(0.97_0.02_350)] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-[oklch(0.92_0.04_350)] max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-[oklch(0.55_0.08_350)] mb-4">You don't have admin permissions.</p>
          <p className="text-sm text-[oklch(0.60_0.06_350)]">Signed in as: {user.primaryEmailAddress?.emailAddress}</p>
          <button onClick={() => window.Clerk.signOut()} className="mt-4 px-4 py-2 rounded-lg bg-[oklch(0.90_0.03_350)] text-[oklch(0.40_0.06_350)]">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.02_350)]">
      <header className="bg-[oklch(0.25_0.05_350)] text-white py-6 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-white/70 text-sm">The Knitting Computer</p>
          </div>
          <button onClick={() => window.Clerk.openUserProfile()} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-full hover:bg-white/20">
            <img src={user.imageUrl} alt={user.firstName} className="w-8 h-8 rounded-full" />
            <span className="text-sm">{user.firstName}</span>
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
            <div className="text-4xl mb-2">👥</div>
            <div className="text-3xl font-bold text-[oklch(0.40_0.10_350)]">{tenants.length}</div>
            <div className="text-sm text-[oklch(0.55_0.08_350)]">Total Tenants</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
            <div className="text-4xl mb-2">🧶</div>
            <div className="text-3xl font-bold text-[oklch(0.40_0.10_350)]">—</div>
            <div className="text-sm text-[oklch(0.55_0.08_350)]">Patterns Generated</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-[oklch(0.92_0.04_350)]">
            <div className="text-4xl mb-2">💰</div>
            <div className="text-3xl font-bold text-[oklch(0.40_0.10_350)]">$0</div>
            <div className="text-sm text-[oklch(0.55_0.08_350)]">Monthly Revenue</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-[oklch(0.92_0.04_350)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[oklch(0.94_0.03_350)]">
            <h2 className="text-lg font-bold text-[oklch(0.40_0.10_350)]">Tenants</h2>
          </div>
          {tenants.length === 0 ? (
            <div className="p-8 text-center text-[oklch(0.55_0.08_350)]">
              <p>No tenants yet.</p>
              <p className="text-sm mt-2">Tenants will appear here when users claim subdomains.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[oklch(0.97_0.02_350)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[oklch(0.50_0.06_350)] uppercase">Subdomain</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[oklch(0.50_0.06_350)] uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[oklch(0.50_0.06_350)] uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[oklch(0.94_0.03_350)]">
                {tenants.map(tenant => (
                  <tr key={tenant._id} className="hover:bg-[oklch(0.98_0.01_350)]">
                    <td className="px-6 py-4">
                      <a href={`https://${tenant.subdomain}.${ROOT_DOMAIN}`} className="text-[oklch(0.50_0.12_290)] hover:underline font-medium">{tenant.subdomain}.{ROOT_DOMAIN}</a>
                    </td>
                    <td className="px-6 py-4 text-sm text-[oklch(0.55_0.08_350)]">{new Date(tenant.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Active</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

// ============================================
// MAIN ROUTER
// ============================================
export default function App() {
  const subdomain = getSubdomain();
  if (subdomain === 'admin') return <AdminDashboard />;
  if (!subdomain) return <LandingPage />;
  return <TenantWithAuth subdomain={subdomain} />;
}
