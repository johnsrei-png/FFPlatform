# Complete Netlify Deployment Guide
## Fantasy Salary Manager - Step-by-Step

This guide will walk you through deploying your Fantasy Salary Manager to Netlify from start to finish.

---

## Prerequisites

Before you start, make sure you have:
- [ ] A GitHub account (free) - https://github.com/join
- [ ] A Netlify account (free) - https://app.netlify.com/signup
- [ ] The fantasy-salary-app.tar.gz file downloaded

---

## Step 1: Extract the Project Files

1. **Find the downloaded file**: `fantasy-salary-app.tar.gz`

2. **Extract it**:
   - **Mac**: Double-click the file
   - **Windows**: Right-click → "Extract All"
   - **Linux**: `tar -xzf fantasy-salary-app.tar.gz`

3. You should now have a folder called `fantasy-salary-app` with these files:
   ```
   fantasy-salary-app/
   ├── public/
   │   └── index.html
   ├── netlify/
   │   └── functions/
   │       ├── get-league.js
   │       └── salaries.js
   ├── netlify.toml
   ├── package.json
   ├── README.md
   └── .gitignore
   ```

---

## Step 2: Create a GitHub Repository

### Option A: Using GitHub Desktop (Easiest for beginners)

1. **Download GitHub Desktop**: https://desktop.github.com/
2. **Install and sign in** with your GitHub account
3. **Click**: File → Add Local Repository
4. **Browse** to your `fantasy-salary-app` folder
5. **Click**: "Create a repository" (if it asks)
6. **Fill in**:
   - Name: `fantasy-salary-manager`
   - Description: `Sleeper fantasy football salary cap tracker`
7. **Click**: "Create Repository"
8. **Click**: "Publish repository" (top right)
9. **Uncheck** "Keep this code private" (or leave checked if you prefer)
10. **Click**: "Publish Repository"

✅ Done! Your code is now on GitHub.

### Option B: Using Command Line (If you're comfortable with terminal)

1. **Open Terminal/Command Prompt**

2. **Navigate to your folder**:
   ```bash
   cd path/to/fantasy-salary-app
   ```

3. **Initialize git**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Fantasy Salary Manager"
   ```

4. **Create a new repository on GitHub**:
   - Go to https://github.com/new
   - Name: `fantasy-salary-manager`
   - Click "Create repository"

5. **Push your code** (replace YOUR_USERNAME):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fantasy-salary-manager.git
   git branch -M main
   git push -u origin main
   ```

✅ Done! Your code is now on GitHub.

---

## Step 3: Deploy to Netlify

Now for the easy part!

### 3.1: Connect Netlify to GitHub

1. **Go to Netlify**: https://app.netlify.com/
2. **Sign in** (or create account using GitHub - this makes Step 3.2 easier)
3. **Click**: "Add new site" button (top right)
4. **Click**: "Import an existing project"

### 3.2: Import Your Repository

1. **Click**: "Deploy with GitHub"
2. If prompted, **authorize Netlify** to access your GitHub
3. **Search** for `fantasy-salary-manager` in the repository list
4. **Click** on your repository

### 3.3: Configure Build Settings

Good news! The settings should be **auto-detected** from your `netlify.toml` file:

You should see:
- **Build command**: (leave empty - we don't need one)
- **Publish directory**: `public`
- **Functions directory**: `netlify/functions`

### 3.4: Deploy!

1. **Click**: "Deploy fantasy-salary-manager" (big button at bottom)
2. **Wait** 30-60 seconds while Netlify builds your site

You'll see a progress screen with logs. When it's done, you'll see:
- ✅ "Site is live"
- A URL like: `https://random-name-123456.netlify.app`

---

## Step 4: Test Your Live Site

1. **Click** on the live URL
2. **Enter a Sleeper League ID**: Try `1044679539959214080` (test league)
3. **Click**: "Connect League"
4. **Wait** a few seconds for data to load
5. **Success!** You should see team rosters and salary caps

---

## Step 5: Customize Your Site URL (Optional)

Your site has a random URL like `random-name-123456.netlify.app`. Let's make it better:

1. **In Netlify dashboard**, click "Site settings"
2. **Click**: "Change site name" (under Site details)
3. **Enter** a custom name: `my-fantasy-salary` (must be unique)
4. **Save**

Your new URL: `https://my-fantasy-salary.netlify.app`

---

## Step 6: Share With Your League

Now you can share your app! Send your league members:
- Your site URL
- Instructions to enter your league ID

Everyone can view the salary caps in real-time!

---

## Troubleshooting

### "Deploy failed" or "Function error"

1. **Check the deploy log** in Netlify
2. Look for errors in red text
3. Common fixes:
   - Make sure all files were uploaded to GitHub
   - Check that `netlify.toml` exists in root folder
   - Verify `netlify/functions/` folder has the .js files

### "Failed to fetch" when clicking Connect League

1. **Check the Function logs** in Netlify:
   - Dashboard → Functions tab → Click on `get-league`
   - Look for error messages
2. Try a different League ID to verify it's not the specific league
3. Check that your League ID is correct (numbers only, no spaces)

### Site loads but shows blank page

1. **Open browser console**: Right-click → Inspect → Console tab
2. Look for JavaScript errors (red text)
3. Common fix: Clear browser cache and reload

---

## Next Steps - Making Updates

After your initial deploy, here's how to update your site:

### Method 1: GitHub Desktop
1. Make changes to files locally
2. Open GitHub Desktop
3. Write a commit message (e.g., "Updated salary cap to $300")
4. Click "Commit to main"
5. Click "Push origin"
6. Netlify automatically deploys! (Takes 30 seconds)

### Method 2: Command Line
```bash
git add .
git commit -m "Your update description"
git push
```
Netlify auto-deploys within 30 seconds.

---

## Advanced: Environment Variables (For Future Database Integration)

When you're ready to add a database, you'll add environment variables:

1. **In Netlify Dashboard**: Site settings → Environment variables
2. **Click**: "Add a variable"
3. **Add** your database credentials (e.g., `DATABASE_URL`)
4. Functions can access these via `process.env.DATABASE_URL`

---

## Cost

- GitHub: **FREE** ✅
- Netlify Free Tier:
  - 100 GB bandwidth/month
  - 300 build minutes/month
  - 125k serverless function requests/month
  - **More than enough for personal league use!** ✅

---

## Support

If you get stuck:
1. Check the Netlify deploy logs (most errors are clearly explained)
2. Check browser console for JavaScript errors
3. Verify all files are in GitHub repository
4. Make sure file structure matches the guide

---

## Summary Checklist

- [ ] Extract project files
- [ ] Create GitHub repository
- [ ] Push code to GitHub
- [ ] Create Netlify account
- [ ] Connect Netlify to GitHub
- [ ] Import your repository
- [ ] Deploy site
- [ ] Test with a League ID
- [ ] Customize URL (optional)
- [ ] Share with league!

---

**Congratulations!** 🎉 

Your Fantasy Salary Manager is now live on the internet!
