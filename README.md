# Fantasy Salary Manager - Netlify Edition

A fantasy football salary cap management platform with Sleeper API integration, built for Netlify.

## Features

- 🔗 **Sleeper Integration** - Automatically sync rosters, transactions, and league data
- 💰 **Salary Cap Tracking** - $200 cap with real-time team calculations
- 📊 **Team Dashboard** - Visual cap space indicators and player breakdowns
- 🔄 **Transaction Feed** - Recent trades, waivers, and roster moves
- 💾 **Data Persistence** - localStorage for salary data (upgradeable to database)

## Quick Start

### Option 1: Deploy to Netlify (Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Deploy on Netlify**
   - Go to [Netlify](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repo
   - Build settings are auto-detected from `netlify.toml`
   - Click "Deploy"

3. **Done!** Your app will be live at `https://your-site.netlify.app`

### Option 2: Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run locally**
   ```bash
   npm run dev
   ```

3. **Open browser**
   ```
   http://localhost:8888
   ```

## How to Use

1. **Get your Sleeper League ID**
   - Go to Sleeper.com → Your League
   - Copy the ID from the URL: `sleeper.com/leagues/YOUR_ID_HERE`

2. **Enter League ID** in the app and click "Connect League"

3. **View your league** with salary cap breakdowns for each team

## Project Structure

```
fantasy-salary-app/
├── public/
│   └── index.html           # Frontend application
├── netlify/
│   └── functions/
│       ├── get-league.js    # Fetches data from Sleeper API
│       └── salaries.js      # Saves/retrieves salary data
├── netlify.toml             # Netlify configuration
├── package.json             # Dependencies
└── README.md
```

## API Endpoints

### GET /api/get-league?leagueId={id}
Fetches league data from Sleeper including:
- League info
- Team rosters
- Users/owners
- All NFL players
- Recent transactions

### POST /api/salaries
Saves salary data (currently client-side only)

### GET /api/salaries?leagueId={id}
Retrieves saved salary data

## Upgrading to a Database

Currently, salary data is stored in browser localStorage. To upgrade to persistent storage:

### Option 1: Supabase (Free tier available)
```bash
npm install @supabase/supabase-js
```

Update `netlify/functions/salaries.js` to use Supabase:
```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
```

Add environment variables in Netlify:
- `SUPABASE_URL`
- `SUPABASE_KEY`

### Option 2: MongoDB Atlas (Free tier available)
```bash
npm install mongodb
```

### Option 3: Netlify Blobs (Built-in storage)
```bash
npm install @netlify/blobs
```

## Customization

### Change Salary Cap
Edit `SALARY_CAP` constant in `public/index.html` (default: $200)

### Keeper Escalation
Users can configure this in the UI (default: $5)

### Styling
All CSS is in `public/index.html` - customize the design tokens in `:root`

## Future Enhancements

- [ ] Editable player salaries
- [ ] Keeper management interface
- [ ] Trade validator
- [ ] Draft integration
- [ ] Multi-season history
- [ ] Export to CSV
- [ ] Mobile app version

## Support

Questions? Issues? Open a GitHub issue or contact the developer.

## License

MIT
