1. Implement a game page
   1. + Separate current simulation UI into a separate page
   2. Tidy up the PoC
      1. Create a UI kit, implemented on-demand
         1. buttons - primary, secondary, ghost, danger, disabled
         2. inputs - number, select, checkbox, radio, switch
         3. accordion
         4. palette - colors, gradients
         5. typography - headings, text, code, links
         6. tooltips/popovers
         7. modals/dialogs
         8. themes - light, dark, system
         9. intl
         10. svg icons set
         11. Assets - images, fonts, music, sounds, etc
         12. animations
      2. Create a new page with a proper game ui with 4 tabs:
         1. market - the price graph and order placement controls
         2. account profile - balance, portfolio, orders, liquidations, stats, etc
         3. economy - clicker mini-game where you earn money
         4. settings - market display settings, performance dials, feature flags, lang select, etc
         5. desktop first, mobile second, but not neglected
      3. Save system - store simulation and account state in a file/localstorage
         1. Autosave
         2. Manual load/save
      4. Offline simulation/time skip/speedup
      5. Multiplayer - play in the same session as other players
         1. Centralized state and simulation on a server
         2. Or P2P with discovery through centralized server 
         3. Local network discovery
      6. Challenges/tasks to direct players?
      7. Market narrator - a system that would direct and adjust parameters of the market simulation and simulate market events like dump/pump
      8. Native build?
      9. Funding, marketing, discoverability https://chatgpt.com/c/6a01d729-4d34-8393-aea3-337e52f37b34
         1. Shareable artifacts, like game session stats and results, leaderboards, etc
         2. Setup conversion targets - discord, email, twitter, reddit, steam, patreon, yt, devlog?, etc
         3. Advertise/sell this version
2. Implement basic economy simulation
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