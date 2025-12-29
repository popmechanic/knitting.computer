import React, { useState, useEffect } from "react";
import { useFireproof } from "use-fireproof";

// Utility functions for prediction market math
const calculatePrices = (pools) => {
  const total = pools.reduce((sum, p) => sum + p, 0);
  return pools.map(p => total > 0 ? p / total : 1 / pools.length);
};

const calculateBuyCost = (pools, outcomeIndex, shares) => {
  const k = pools.reduce((a, b) => a * b, 1);
  const newPools = [...pools];
  newPools[outcomeIndex] += shares;
  const newProduct = newPools.reduce((a, b) => a * b, 1);
  return Math.abs(shares * (newProduct / k - 1) * 0.1 + shares * (pools[outcomeIndex] / pools.reduce((a, b) => a + b, 0)));
};

export default function App() {
  const { database, useLiveQuery, useDocument } = useFireproof("prediction-markets-db");

  // UI State
  const [view, setView] = useState("welcome");
  const [selectedMarketId, setSelectedMarketId] = useState(null);
  const [userId, setUserId] = useState(() => localStorage.getItem("pm_user_id") || null);
  const [tradeAmount, setTradeAmount] = useState(10);
  const [selectedOutcome, setSelectedOutcome] = useState(0);

  // Forms
  const { doc: newUser, merge: mergeUser, reset: resetUser } = useDocument({
    type: "user", displayName: "", balance: 1000
  });
  const { doc: newMarket, merge: mergeMarket, reset: resetMarket } = useDocument({
    type: "market", question: "", outcomes: ["Yes", "No"], deadline: "", creatorId: "", status: "active"
  });

  // Queries
  const { docs: allUsers } = useLiveQuery("type", { key: "user" });
  const { docs: allMarkets } = useLiveQuery("type", { key: "market" });
  const { docs: allPositions } = useLiveQuery("type", { key: "position" });
  const { docs: allTrades } = useLiveQuery("type", { key: "trade" });

  // Derived data
  const currentUser = allUsers.find(u => u._id === userId);
  const userPositions = allPositions.filter(p => p.userId === userId);
  const selectedMarket = allMarkets.find(m => m._id === selectedMarketId);

  // Persist user ID
  useEffect(() => {
    if (userId) localStorage.setItem("pm_user_id", userId);
  }, [userId]);

  // Auto-navigate when user exists
  useEffect(() => {
    if (currentUser && view === "welcome") {
      setView("dashboard");
    }
  }, [currentUser, view]);

  // Actions
  const createUser = async () => {
    if (!newUser.displayName.trim()) return;
    const { id } = await database.put({
      type: "user",
      displayName: newUser.displayName,
      balance: 1000,
      createdAt: Date.now()
    });
    setUserId(id);
    resetUser();
    setView("dashboard");
  };

  const createMarket = async () => {
    if (!newMarket.question.trim() || !userId) return;
    const outcomes = newMarket.outcomes.filter(o => o.trim());
    if (outcomes.length < 2) return;

    const initialPool = 100;
    const { id } = await database.put({
      type: "market",
      question: newMarket.question,
      outcomes: outcomes,
      pools: outcomes.map(() => initialPool),
      deadline: newMarket.deadline || null,
      creatorId: userId,
      status: "active",
      resolution: null,
      createdAt: Date.now()
    });
    resetMarket();
    setSelectedMarketId(id);
    setView("market");
  };

  const executeTrade = async (isBuy = true) => {
    if (!selectedMarket || !currentUser || tradeAmount <= 0) return;

    const cost = calculateBuyCost(selectedMarket.pools, selectedOutcome, tradeAmount);
    if (isBuy && cost > currentUser.balance) return;

    // Update pools
    const newPools = [...selectedMarket.pools];
    newPools[selectedOutcome] += isBuy ? tradeAmount : -tradeAmount;
    if (newPools[selectedOutcome] < 1) newPools[selectedOutcome] = 1;

    await database.put({ ...selectedMarket, pools: newPools });

    // Update user balance
    await database.put({
      ...currentUser,
      balance: currentUser.balance + (isBuy ? -cost : cost * 0.95)
    });

    // Record trade with price snapshot
    const pricesAfterTrade = calculatePrices(newPools);
    await database.put({
      type: "trade",
      marketId: selectedMarket._id,
      userId: userId,
      outcomeIndex: selectedOutcome,
      shares: isBuy ? tradeAmount : -tradeAmount,
      cost: isBuy ? cost : -cost * 0.95,
      prices: pricesAfterTrade,
      timestamp: Date.now()
    });

    // Update position
    const existingPosition = allPositions.find(
      p => p.marketId === selectedMarket._id && p.userId === userId && p.outcomeIndex === selectedOutcome
    );
    if (existingPosition) {
      await database.put({
        ...existingPosition,
        shares: existingPosition.shares + (isBuy ? tradeAmount : -tradeAmount),
        totalCost: existingPosition.totalCost + (isBuy ? cost : -cost)
      });
    } else if (isBuy) {
      await database.put({
        type: "position",
        marketId: selectedMarket._id,
        userId: userId,
        outcomeIndex: selectedOutcome,
        shares: tradeAmount,
        totalCost: cost
      });
    }
  };

  const resolveMarket = async (winningIndex) => {
    if (!selectedMarket || selectedMarket.creatorId !== userId) return;

    await database.put({
      ...selectedMarket,
      status: "resolved",
      resolution: winningIndex
    });

    // Payout winners
    const marketPositions = allPositions.filter(
      p => p.marketId === selectedMarket._id && p.outcomeIndex === winningIndex
    );

    const totalWinningShares = marketPositions.reduce((sum, p) => sum + p.shares, 0);
    const totalPool = selectedMarket.pools.reduce((sum, p) => sum + p, 0);

    for (const pos of marketPositions) {
      const user = allUsers.find(u => u._id === pos.userId);
      if (user && totalWinningShares > 0) {
        const payout = (pos.shares / totalWinningShares) * totalPool * 0.9;
        await database.put({ ...user, balance: user.balance + payout });
      }
    }
  };

  const switchUser = () => {
    localStorage.removeItem("pm_user_id");
    setUserId(null);
    setView("welcome");
  };

  // Calculate leaderboard
  const leaderboard = allUsers
    .map(u => ({
      ...u,
      totalValue: u.balance + allPositions
        .filter(p => p.userId === u._id)
        .reduce((sum, p) => {
          const market = allMarkets.find(m => m._id === p.marketId);
          if (!market || market.status === "resolved") return sum;
          const prices = calculatePrices(market.pools);
          return sum + p.shares * prices[p.outcomeIndex] * 100;
        }, 0)
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  // Price Chart Component
  const PriceChart = ({ marketId, outcomes }) => {
    const marketTrades = allTrades
      .filter(t => t.marketId === marketId && t.prices)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (marketTrades.length < 2) {
      return (
        <div className="bg-white/5 rounded-xl p-4 text-center text-white/30 text-sm">
          Chart appears after 2+ trades
        </div>
      );
    }

    const width = 320;
    const height = 120;
    const padding = { top: 10, right: 10, bottom: 20, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const timeRange = [marketTrades[0].timestamp, marketTrades[marketTrades.length - 1].timestamp];
    const timeSpan = timeRange[1] - timeRange[0] || 1;

    const getX = (timestamp) => padding.left + ((timestamp - timeRange[0]) / timeSpan) * chartWidth;
    const getY = (price) => padding.top + (1 - price) * chartHeight;

    const colors = [
      'oklch(0.72 0.18 155)', // green
      'oklch(0.65 0.18 25)',  // red
      'oklch(0.65 0.15 260)', // purple
      'oklch(0.65 0.15 320)', // pink
      'oklch(0.65 0.15 80)',  // yellow
      'oklch(0.65 0.15 200)', // cyan
    ];

    return (
      <div className="bg-white/5 rounded-xl p-4">
        <p className="text-xs text-white/40 mb-2">Price History</p>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <g key={v}>
              <line
                x1={padding.left}
                y1={getY(v)}
                x2={width - padding.right}
                y2={getY(v)}
                stroke="white"
                strokeOpacity={0.1}
                strokeDasharray="2,2"
              />
              <text
                x={padding.left - 5}
                y={getY(v)}
                fill="white"
                fillOpacity={0.3}
                fontSize="8"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Price lines for each outcome */}
          {outcomes.map((outcome, i) => {
            const points = marketTrades.map(t => ({
              x: getX(t.timestamp),
              y: getY(t.prices[i])
            }));
            const pathD = points.map((p, j) => `${j === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

            return (
              <g key={i}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* End dot */}
                <circle
                  cx={points[points.length - 1].x}
                  cy={points[points.length - 1].y}
                  r="3"
                  fill={colors[i % colors.length]}
                />
              </g>
            );
          })}
        </svg>
        <div className="flex gap-3 mt-2 text-xs">
          {outcomes.map((outcome, i) => (
            <span key={i} className="flex items-center gap-1 text-white/50">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: colors[i % colors.length] }}
              />
              {outcome}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // Render helpers
  const ProbabilityBar = ({ prices, outcomes, small = false }) => (
    <div className={`flex ${small ? 'h-2' : 'h-8'} rounded-full overflow-hidden bg-white/5`}>
      {prices.map((price, i) => (
        <div
          key={i}
          style={{ width: `${price * 100}%` }}
          className={`${
            i === 0 ? 'bg-[oklch(0.72_0.18_155)]' :
            i === 1 ? 'bg-[oklch(0.65_0.18_25)]' :
            `bg-[oklch(0.65_0.15_${(i * 60 + 200) % 360})]`
          } ${small ? '' : 'flex items-center justify-center'} transition-all duration-500`}
        >
          {!small && price > 0.1 && (
            <span className="text-xs font-semibold text-white drop-shadow-lg font-['Space_Grotesk']">
              {(price * 100).toFixed(0)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );

  const NavButton = ({ icon, label, viewName }) => (
    <button
      onClick={() => setView(viewName)}
      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
        view === viewName
          ? 'bg-[oklch(0.75_0.15_195)]/20 text-[oklch(0.75_0.15_195)]'
          : 'text-white/50 hover:text-white/80'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium font-['Inter']">{label}</span>
    </button>
  );

  // Welcome/Onboarding
  if (view === "welcome" || !currentUser) {
    return (
      <div className="min-h-screen bg-[oklch(0.11_0.025_265)] flex flex-col items-center justify-center p-6 font-['Inter']">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-white font-['Space_Grotesk'] tracking-tight">
              Predict<span className="text-[oklch(0.75_0.15_195)]">.</span>
            </h1>
            <p className="text-white/50">Private prediction markets</p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white font-['Space_Grotesk']">Enter your name</h2>
            <input
              type="text"
              placeholder="Display name"
              value={newUser.displayName}
              onChange={(e) => mergeUser({ displayName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && createUser()}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[oklch(0.75_0.15_195)]/50 transition-colors"
            />
            <button
              onClick={createUser}
              disabled={!newUser.displayName.trim()}
              className="w-full py-3 bg-[oklch(0.75_0.15_195)] text-[oklch(0.15_0.02_195)] font-semibold rounded-xl hover:bg-[oklch(0.8_0.15_195)] disabled:opacity-30 disabled:cursor-not-allowed transition-all font-['Space_Grotesk']"
            >
              Enter Market
            </button>
          </div>

          {allUsers.length > 0 && (
            <div className="space-y-3">
              <p className="text-center text-white/30 text-sm">or continue as</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {allUsers.slice(0, 6).map(user => (
                  <button
                    key={user._id}
                    onClick={() => { setUserId(user._id); setView("dashboard"); }}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/70 text-sm hover:bg-white/10 hover:text-white transition-all"
                  >
                    {user.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div className="min-h-screen bg-[oklch(0.11_0.025_265)] font-['Inter'] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[oklch(0.11_0.025_265)]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white font-['Space_Grotesk']">
            Predict<span className="text-[oklch(0.75_0.15_195)]">.</span>
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-white font-semibold font-['Space_Grotesk']">
                {currentUser.balance.toFixed(0)} <span className="text-[oklch(0.75_0.15_195)]">◆</span>
              </p>
              <p className="text-xs text-white/40">{currentUser.displayName}</p>
            </div>
            <button
              onClick={switchUser}
              className="p-2 text-white/30 hover:text-white/60 transition-colors"
              title="Switch user"
            >
              ↩
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Dashboard */}
        {view === "dashboard" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white font-['Space_Grotesk']">Active Markets</h2>
              <button
                onClick={() => setView("create")}
                className="px-4 py-2 bg-[oklch(0.75_0.15_195)] text-[oklch(0.15_0.02_195)] text-sm font-semibold rounded-xl hover:bg-[oklch(0.8_0.15_195)] transition-all font-['Space_Grotesk']"
              >
                + New Market
              </button>
            </div>

            {allMarkets.filter(m => m.status === "active").length === 0 ? (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
                <p className="text-white/50 mb-4">No active markets yet</p>
                <button
                  onClick={() => setView("create")}
                  className="text-[oklch(0.75_0.15_195)] font-medium hover:underline"
                >
                  Create the first one →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {allMarkets.filter(m => m.status === "active").map(market => {
                  const prices = calculatePrices(market.pools);
                  return (
                    <button
                      key={market._id}
                      onClick={() => { setSelectedMarketId(market._id); setView("market"); }}
                      className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-left hover:bg-white/10 transition-all group"
                    >
                      <p className="text-white font-medium mb-3 group-hover:text-[oklch(0.75_0.15_195)] transition-colors">
                        {market.question}
                      </p>
                      <ProbabilityBar prices={prices} outcomes={market.outcomes} />
                      <div className="flex gap-4 mt-3 text-xs text-white/40">
                        {market.outcomes.map((outcome, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${
                              i === 0 ? 'bg-[oklch(0.72_0.18_155)]' :
                              i === 1 ? 'bg-[oklch(0.65_0.18_25)]' :
                              `bg-[oklch(0.65_0.15_${(i * 60 + 200) % 360})]`
                            }`} />
                            {outcome}: {(prices[i] * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Resolved Markets */}
            {allMarkets.filter(m => m.status === "resolved").length > 0 && (
              <div className="space-y-4 mt-8">
                <h3 className="text-sm font-medium text-white/40 uppercase tracking-wide">Resolved</h3>
                {allMarkets.filter(m => m.status === "resolved").map(market => (
                  <div
                    key={market._id}
                    className="bg-white/5 border border-white/5 rounded-xl p-4 opacity-60"
                  >
                    <p className="text-white/80 text-sm">{market.question}</p>
                    <p className="text-[oklch(0.72_0.18_155)] text-sm mt-1 font-medium">
                      ✓ {market.outcomes[market.resolution]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Create Market */}
        {view === "create" && (
          <div className="space-y-6">
            <button
              onClick={() => setView("dashboard")}
              className="text-white/50 hover:text-white flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="text-xl font-semibold text-white font-['Space_Grotesk']">Create Market</h2>

              <div>
                <label className="block text-sm text-white/50 mb-2">Question</label>
                <input
                  type="text"
                  placeholder="Will Bitcoin reach $100k by end of year?"
                  value={newMarket.question}
                  onChange={(e) => mergeMarket({ question: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[oklch(0.75_0.15_195)]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-white/50 mb-2">Outcomes</label>
                <div className="space-y-2">
                  {newMarket.outcomes.map((outcome, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`Outcome ${i + 1}`}
                        value={outcome}
                        onChange={(e) => {
                          const newOutcomes = [...newMarket.outcomes];
                          newOutcomes[i] = e.target.value;
                          mergeMarket({ outcomes: newOutcomes });
                        }}
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[oklch(0.75_0.15_195)]/50 transition-colors"
                      />
                      {newMarket.outcomes.length > 2 && (
                        <button
                          onClick={() => mergeMarket({ outcomes: newMarket.outcomes.filter((_, j) => j !== i) })}
                          className="px-3 text-white/30 hover:text-red-400 transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {newMarket.outcomes.length < 6 && (
                  <button
                    onClick={() => mergeMarket({ outcomes: [...newMarket.outcomes, ""] })}
                    className="mt-2 text-sm text-[oklch(0.75_0.15_195)] hover:underline"
                  >
                    + Add outcome
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/50 mb-2">Deadline (optional)</label>
                <input
                  type="datetime-local"
                  value={newMarket.deadline}
                  onChange={(e) => mergeMarket({ deadline: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[oklch(0.75_0.15_195)]/50 transition-colors"
                />
              </div>

              <button
                onClick={createMarket}
                disabled={!newMarket.question.trim() || newMarket.outcomes.filter(o => o.trim()).length < 2}
                className="w-full py-4 bg-[oklch(0.75_0.15_195)] text-[oklch(0.15_0.02_195)] font-semibold rounded-xl hover:bg-[oklch(0.8_0.15_195)] disabled:opacity-30 disabled:cursor-not-allowed transition-all font-['Space_Grotesk']"
              >
                Create Market
              </button>
            </div>
          </div>
        )}

        {/* Market Detail */}
        {view === "market" && selectedMarket && (
          <div className="space-y-6">
            <button
              onClick={() => setView("dashboard")}
              className="text-white/50 hover:text-white flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white font-['Space_Grotesk']">
                  {selectedMarket.question}
                </h2>
                {selectedMarket.deadline && (
                  <p className="text-sm text-white/40 mt-1">
                    Closes: {new Date(selectedMarket.deadline).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Price Chart */}
              <PriceChart marketId={selectedMarket._id} outcomes={selectedMarket.outcomes} />

              {selectedMarket.status === "active" ? (
                <>
                  <div className="space-y-3">
                    {selectedMarket.outcomes.map((outcome, i) => {
                      const prices = calculatePrices(selectedMarket.pools);
                      const isSelected = selectedOutcome === i;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedOutcome(i)}
                          className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-[oklch(0.75_0.15_195)] bg-[oklch(0.75_0.15_195)]/10'
                              : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <span className="text-white font-medium">{outcome}</span>
                          <span className={`text-2xl font-bold font-['Space_Grotesk'] ${
                            i === 0 ? 'text-[oklch(0.72_0.18_155)]' :
                            i === 1 ? 'text-[oklch(0.65_0.18_25)]' :
                            'text-[oklch(0.75_0.15_195)]'
                          }`}>
                            {(prices[i] * 100).toFixed(1)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-4">
                    <div>
                      <label className="block text-sm text-white/50 mb-2">Shares to trade</label>
                      <div className="flex gap-2">
                        {[10, 25, 50, 100].map(amt => (
                          <button
                            key={amt}
                            onClick={() => setTradeAmount(amt)}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                              tradeAmount === amt
                                ? 'bg-[oklch(0.75_0.15_195)] text-[oklch(0.15_0.02_195)]'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            {amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => executeTrade(true)}
                        disabled={calculateBuyCost(selectedMarket.pools, selectedOutcome, tradeAmount) > currentUser.balance}
                        className="flex-1 py-4 bg-[oklch(0.72_0.18_155)] text-[oklch(0.15_0.02_155)] font-semibold rounded-xl hover:bg-[oklch(0.77_0.18_155)] disabled:opacity-30 disabled:cursor-not-allowed transition-all font-['Space_Grotesk']"
                      >
                        Buy {selectedMarket.outcomes[selectedOutcome]}
                        <span className="block text-xs opacity-70 mt-1">
                          Cost: ~{calculateBuyCost(selectedMarket.pools, selectedOutcome, tradeAmount).toFixed(0)} ◆
                        </span>
                      </button>
                      <button
                        onClick={() => executeTrade(false)}
                        className="flex-1 py-4 bg-[oklch(0.65_0.18_25)] text-white font-semibold rounded-xl hover:bg-[oklch(0.7_0.18_25)] transition-all font-['Space_Grotesk']"
                      >
                        Sell
                      </button>
                    </div>
                  </div>

                  {/* Resolve (creator only) */}
                  {selectedMarket.creatorId === userId && (
                    <div className="pt-4 border-t border-white/10">
                      <p className="text-sm text-white/50 mb-3">Resolve market (creator only)</p>
                      <div className="flex gap-2 flex-wrap">
                        {selectedMarket.outcomes.map((outcome, i) => (
                          <button
                            key={i}
                            onClick={() => resolveMarket(i)}
                            className="px-4 py-2 bg-white/10 text-white/80 text-sm rounded-lg hover:bg-[oklch(0.72_0.18_155)] hover:text-[oklch(0.15_0.02_155)] transition-all"
                          >
                            {outcome} wins
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-[oklch(0.72_0.18_155)] text-lg font-semibold font-['Space_Grotesk']">
                    ✓ Resolved: {selectedMarket.outcomes[selectedMarket.resolution]}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Portfolio */}
        {view === "portfolio" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white font-['Space_Grotesk']">Your Portfolio</h2>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <p className="text-white/50 text-sm">Balance</p>
              <p className="text-3xl font-bold text-white font-['Space_Grotesk']">
                {currentUser.balance.toFixed(0)} <span className="text-[oklch(0.75_0.15_195)]">◆</span>
              </p>
            </div>

            <h3 className="text-sm font-medium text-white/40 uppercase tracking-wide">Positions</h3>

            {userPositions.filter(p => p.shares > 0).length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-white/50">
                No active positions
              </div>
            ) : (
              <div className="space-y-3">
                {userPositions.filter(p => p.shares > 0).map(pos => {
                  const market = allMarkets.find(m => m._id === pos.marketId);
                  if (!market) return null;
                  const prices = calculatePrices(market.pools);
                  const currentValue = pos.shares * prices[pos.outcomeIndex] * 100;
                  const pnl = currentValue - pos.totalCost;

                  return (
                    <div
                      key={pos._id}
                      className="bg-white/5 border border-white/10 rounded-xl p-4"
                    >
                      <p className="text-white/80 text-sm mb-2">{market.question}</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-white font-medium">{market.outcomes[pos.outcomeIndex]}</span>
                          <span className="text-white/40 text-sm ml-2">{pos.shares} shares</span>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-semibold font-['Space_Grotesk']">
                            {currentValue.toFixed(0)} ◆
                          </p>
                          <p className={`text-sm ${pnl >= 0 ? 'text-[oklch(0.72_0.18_155)]' : 'text-[oklch(0.65_0.18_25)]'}`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard */}
        {view === "leaderboard" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white font-['Space_Grotesk']">Leaderboard</h2>

            <div className="space-y-2">
              {leaderboard.map((user, rank) => (
                <div
                  key={user._id}
                  className={`flex items-center gap-4 p-4 rounded-xl ${
                    user._id === userId ? 'bg-[oklch(0.75_0.15_195)]/10 border border-[oklch(0.75_0.15_195)]/30' : 'bg-white/5'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold font-['Space_Grotesk'] ${
                    rank === 0 ? 'bg-[oklch(0.8_0.15_80)] text-[oklch(0.2_0.05_80)]' :
                    rank === 1 ? 'bg-[oklch(0.7_0.02_250)] text-[oklch(0.2_0.01_250)]' :
                    rank === 2 ? 'bg-[oklch(0.6_0.1_50)] text-[oklch(0.2_0.05_50)]' :
                    'bg-white/10 text-white/50'
                  }`}>
                    {rank + 1}
                  </span>
                  <span className="flex-1 text-white font-medium">{user.displayName}</span>
                  <span className="text-white font-bold font-['Space_Grotesk']">
                    {user.totalValue.toFixed(0)} ◆
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[oklch(0.11_0.025_265)]/90 backdrop-blur-xl border-t border-white/5 safe-area-pb">
        <div className="max-w-2xl mx-auto flex justify-around py-2">
          <NavButton icon="📊" label="Markets" viewName="dashboard" />
          <NavButton icon="💼" label="Portfolio" viewName="portfolio" />
          <NavButton icon="🏆" label="Leaders" viewName="leaderboard" />
        </div>
      </nav>

      {/* Font imports */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        .safe-area-pb { padding-bottom: env(safe-area-inset-bottom, 0); }
      `}</style>
    </div>
  );
}
