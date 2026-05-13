1. Implement a game page
   1. + Separate current simulation UI into a separate page
   2. Tidy up the PoC
      1. Create a UI kit, implemented on-demand
         1. + buttons - primary, secondary, ghost, danger, disabled
         2. inputs - + number, + select, text, textarea, checkbox, radio, + switch/tab
         3. Chart - line, bar, pie, donut, etc
         4. table
         5. accordion
         6. "skill tree"
         7. dividers
         8. + palette - colors, gradients
         9. + typography - headings, text, code, links
         10. tooltips/popovers
         11. modals/dialogs
         12. themes - light, dark, system
         13. intl
         14. svg icons set https://lucide.dev/icons/categories#tools
         15. Assets - images, fonts, music, sounds, etc
         16. animations
      2. setup keyboard shortcuts in the ui for all actions per tab
      3. Create a new page with a proper game ui with 4 tabs:
         1. + market - the price graph and order placement controls
         2. account profile - balance, portfolio, orders, liquidations, stats, etc
         3. economy - clicker mini-game where you earn money
         4. settings - market display settings, performance dials, feature flags, lang select, etc
         5. desktop first, mobile second, but not neglected
      4. + The layout is header/body[main/sidebar]/footer
      5. setup survival mechanics
         1. hunger
         2. sleep
         3. health
         4. stress
         5. time management - time to sleep, time to eat, time to work, time to heal
         6. money spending - need to buy food (lower hunger, stress), commodities (lower stress, better sleep, food), medicine (increase health), different quality
      6. Setup progression
         1. Start with market tab disabled and with economy tab active initially
         2. allow user to buy upgrade to enable market tab
         3. at money milestones suggest perks (limited or permanent)
         4. next user can buy upgrade to enable borrowing
         5. the limit orders are initially limited to small amount like 2, then can buy by one them, doubling every 10 buys. Whe hit 100 per buy, allow to buy unlimited
         6. next major upgrade is companies, which unlocks creating a (private) company and interact with other companies
         7. next major upgrade is public companies with investments.
         8. Or instead of company upgrade, you choose skill upgrades, which allows learning industry specific skills
         9. Or instead a management upgrade, which allows you to hire other actors to work for you
         10. Or instead a scientist/engineer upgrade, which allows you to research new technologies
      7. Save system - store simulation and account state in a file/localstorage
         1. Autosave
         2. Manual load/save
      8. Offline simulation/time skip/speedup
      9.  Multiplayer - play in the same session as other players
         1. Centralized state and simulation on a server
         2. Or P2P with discovery through centralized server 
         3. Local network discovery
      10. Challenges/tasks to direct players?
      11. Market narrator - a system that would direct and adjust parameters of the market simulation and simulate market events like dump/pump
      12. Native build?
      13. Funding, marketing, discoverability https://chatgpt.com/c/6a01d729-4d34-8393-aea3-337e52f37b34
         1. Shareable artifacts, like game session stats and results, leaderboards, etc
         2. Setup conversion targets - discord, email, twitter, reddit, steam, patreon, yt, devlog?, etc
         3. Advertise/sell this version
2. Implement economy simulation
   1. Resources
   2. Recipes
   3. Exchanges
   4. Regulators, taxes, banks, governments, laws
   5. Hired workers, skills, characters
   6. Science/tech tree
   7. actors/companies
   8. Actor needs/desires - food, water, shelter, clothing, sleep, psyche, etc
   9. Company stats
   10. Capitalism - stocks, bonds, real estate, derivatives (futures, options), dividents, investors, etc
   11. Insincere actors - randomly violate contracts
   12. infrastructure - automation, storage, logistics, etc
   13. map?
   14. Products and marketing
   15. Unique products - rare, limited, exclusive, etc
   16. insider trading
3. Extend economy tab with ui for:
   1. inventory of resources
   2. production of raw resources
   3. crafting of resources
   4. marketplace for trading of resources with other actors
   5. Skill tree - raw handwork, efficiency, engineering skills
   6. Opportunities - randomly generated permanent (or not) bonuses with pros and cons
   7. Hiring other actors to work/supply resources/tech for you based on some contract
   8. Knowledge tree - learn technologies personally or through other recordings. Record learnings for sharing with other actors. Hire teachers
   9. infrastructure - automation, storage, logistics
4. Implement trading platform functions like trading automation, scripts, auctions, arbitrary pairs.
5. Implement an orchestrator/narrator - a system that create a world narrative, economic events, bot behavior, tracks player performance and adjusts game flow/simulations accordingly
6. Endgame
   1. base - you gain enough to manipulate the market and trivially multiply your wealth
7. Story mode?