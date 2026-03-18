# Grace Logistics Website

A modern, responsive website for Grace Logistics - a leading logistics and supply chain management company in Sri Lanka.

## Features

- Modern, clean design with professional blue color scheme
- Fully responsive (mobile, tablet, desktop)
- Smooth animations and transitions
- Fast loading static HTML/CSS/JS website
- SEO-friendly structure

## Pages

- **Home** - Hero section with company overview and services
- **About** - Company background, mission, vision, values, and team
- **Portfolio** - Company stats and service showcase
- **Contact** - Contact information with embedded Google Maps

## Local Development

To run the website locally:

1. Navigate to the project directory
2. Start a simple HTTP server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser

## Free Hosting Options

### 1. **Netlify** (Recommended)
- **Cost**: Free tier available
- **Benefits**: 
  - Automatic SSL/HTTPS
  - Custom domain support
  - Continuous deployment from Git
  - CDN included
  - 100GB bandwidth/month
- **How to deploy**:
  1. Sign up at https://www.netlify.com
  2. Drag and drop the project folder OR connect to GitHub
  3. Point your domain to Netlify's nameservers

### 2. **Vercel**
- **Cost**: Free tier available
- **Benefits**:
  - Automatic SSL/HTTPS
  - Custom domain support
  - Fast global CDN
  - Easy deployment
- **How to deploy**:
  1. Sign up at https://vercel.com
  2. Import project or deploy via CLI
  3. Configure custom domain in settings

### 3. **GitHub Pages**
- **Cost**: Free
- **Benefits**:
  - Simple and reliable
  - Custom domain support
  - Good for static sites
- **How to deploy**:
  1. Create a GitHub repository
  2. Push your code
  3. Enable GitHub Pages in repository settings
  4. Configure custom domain (CNAME file)

### 4. **Cloudflare Pages**
- **Cost**: Free tier available
- **Benefits**:
  - Unlimited bandwidth
  - Fast global CDN
  - Automatic SSL
  - Custom domain support
- **How to deploy**:
  1. Sign up at https://pages.cloudflare.com
  2. Connect to Git repository
  3. Configure build settings
  4. Set up custom domain

### 5. **Firebase Hosting**
- **Cost**: Free tier (10GB storage, 360MB/day bandwidth)
- **Benefits**:
  - Fast and secure
  - Custom domain support
  - SSL certificate
- **How to deploy**:
  1. Install Firebase CLI: `npm install -g firebase-tools`
  2. Run `firebase init hosting`
  3. Deploy with `firebase deploy`

## Recommended: Netlify

For your use case, **Netlify** is the best option because:
- Easiest to use with drag-and-drop deployment
- Generous free tier
- Excellent performance
- Simple custom domain configuration
- No credit card required for free tier

## Deployment Steps for Netlify

1. **Sign up**: Go to https://www.netlify.com and create a free account
2. **Deploy**: 
   - Click "Add new site" → "Deploy manually"
   - Drag the entire `Gracelogisticslk_V3` folder into the deployment area
3. **Custom domain**:
   - Go to "Domain settings"
   - Add your custom domain: `gracelogisticslk.com`
   - Follow instructions to update DNS records with your domain registrar
   - Netlify will automatically provide SSL certificate

## Domain Configuration

Your client will need to update their domain DNS settings:
- Point to Netlify's nameservers OR
- Add A record pointing to Netlify's IP
- Add CNAME for www subdomain

Full instructions will be provided by Netlify after deployment.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Color Scheme

- Primary Blue: #1e40af
- Secondary Blue: #3b82f6
- Accent Blue: #60a5fa
- Dark Text: #1f2937
- Light Text: #6b7280

## Contact

For any updates or modifications to the website, contact your web developer.
# gracelogistics
