require("dotenv").config();
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const TEST_DATA_LOCATION = "test_data/instagram-danel.zhan-2025-09-13-jfg3wBka/connections/followers_and_following/followers_1.json";
const TEST_DATA_LOCATION_PRE = "test_data/connections/followers_and_following/followers_1.json";

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function shortcodeFromUrl(u) { try { const url = new URL(u); const parts = url.pathname.split("/").filter(Boolean); return parts[1] || "post"; } catch { return "post"; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------- IG sniffer (GraphQL + REST v1) -------- */
const IG_SNIFFER = `
(() => {
  const publish = (topic, data) => {
    try {
      window.__IG_CAPTURED__ = window.__IG_CAPTURED__ || {};
      window.__IG_CAPTURED__[topic] = data;
      console.log("[sniffer] publish", topic, Array.isArray(data) ? data.length : typeof data);
      window.postMessage({ source: "ig-sniffer", topic, data }, "*");
    } catch (e) { console.log("[sniffer] publish error", e?.message); }
  };

  const want = (url) => {
    const u = String(url);
    return (
      u.includes("/api/v1/users/web_profile_info") ||
      u.includes("/api/graphql") || u.includes("/graphql/query") ||
      u.includes("/api/v1/highlights/") ||
      u.includes("/api/v1/feed/reels_tray") || u.includes("/api/v1/feed/reels_media") ||
      u.includes("/api/v1/media/") || u.includes("/api/v1/clips/") ||
      u.includes("/api/v1/media/shortcode/")
    );
  };

  const classify = (url, data) => {
    const u = String(url);
    if (u.includes("web_profile_info")) return "profile_posts";

    if (u.includes("/api/graphql") || u.includes("/graphql/query")) {
      const s = JSON.stringify(data);
      if (s.includes("edge_owner_to_timeline_media")) return "profile_posts";
      if (s.includes("shortcode_media") || s.includes("xdt_shortcode_media")) return "post_carousel";
      if (s.includes("highlight_reels") || s.includes("reels_media")) return "highlights";
    }

    if (u.includes("/api/v1/media/shortcode/")) return "post_carousel";

    if (u.includes("/api/v1/media/") || u.includes("/api/v1/clips/")) {
      if (Array.isArray(data?.items) && data.items.length) return "post_carousel";
      if (data?.media || data?.clip || data?.item) return "post_carousel";
    }

    if (u.includes("/highlights/") || u.includes("/reels_tray") || u.includes("/reels_media")) return "highlights";
    return null;
  };

  const shape = (topic, data) => {
    try {
      if (topic === "profile_posts") {
        const edges =
          data?.data?.user?.edge_owner_to_timeline_media?.edges ||
          data?.data?.xdt_user_by_username?.edge_owner_to_timeline_media?.edges ||
          [];
        return edges.map(e => {
          const n = e.node || {};
          return {
            id: n.id,
            shortcode: n.shortcode,
            __typename: n.__typename || null,
            product_type: n.product_type || null,
            taken_at: n.taken_at_timestamp,
            is_video: !!n.is_video,
            display_url: n.display_url,
            thumbnail_src: n.thumbnail_src,
            caption: n.edge_media_to_caption?.edges?.[0]?.node?.text || "",
            like_count: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? null,
            comment_count: n.edge_media_to_comment?.count ?? null
          };
        });
      }

      if (topic === "highlights") {
        const trays = data?.tray || data?.reels_tray || data?.data?.highlight_reels || data?.data?.reels_media || [];
        return (trays || []).map(t => {
          const cover = t?.cover_media?.cropped_image_version?.url ||
                        t?.cover_media?.image_versions2?.candidates?.[0]?.url ||
                        t?.cover_media?.thumbnail_url || null;
          return {
            id: t?.id || t?.pk || t?.reel?.id || null,
            title: t?.title || t?.name || t?.reel?.title || "",
            user_id: t?.user?.pk || t?.owner?.id || t?.reel?.owner_id || null,
            cover, item_count: t?.media_count ?? t?.reel?.items?.length ?? null
          };
        });
      }

      if (topic === "post_carousel") {
        const sc = data?.data?.shortcode_media || data?.data?.xdt_shortcode_media || null;
        const v1Items = Array.isArray(data?.items) ? data.items
                       : data?.media ? [data.media]
                       : data?.clip ? [data.clip]
                       : data?.item ? [data.item]
                       : [];

        let nodes = [];
        let shortcode = null;

        if (sc) {
          shortcode = sc.shortcode || null;
          const side = sc.edge_sidecar_to_children?.edges?.map(e => e?.node).filter(Boolean);
          nodes = side && side.length ? side : [sc];
        } else if (v1Items.length) {
          const root = v1Items[0];
          shortcode = root?.code || root?.shortcode || null;
          const sidecar = Array.isArray(root?.carousel_media) && root.carousel_media.length
            ? root.carousel_media
            : [root];
          nodes = sidecar;
        } else {
          return [];
        }

        const uniqByUrl = (arr) => { const s = new Set(), out = []; for (const x of arr) { const u = x?.url; if (!u || s.has(u)) continue; s.add(u); out.push(x);} return out; };

        return nodes.map((node, idx) => {
          const isVideo = !!(node?.is_video || node?.media_type === 2 || node?.media_type === "2");

          const dr = Array.isArray(node?.display_resources) ? node.display_resources : [];
          const iv2 = Array.isArray(node?.image_versions2?.candidates) ? node.image_versions2.candidates : [];
          const imgCandidates = uniqByUrl([
            ...dr.map(r => ({ url: r.src, width: r.config_width ?? r.width, height: r.config_height ?? r.height })),
            ...iv2.map(c => ({ url: c.url, width: c.width, height: c.height })),
            node?.display_url ? { url: node.display_url, width: node?.dimensions?.width, height: node?.dimensions?.height } : null,
          ].filter(Boolean));

          const vv = Array.isArray(node?.video_versions) ? node.video_versions : [];
          const videoUrl = node?.video_url ? [{ url: node.video_url }] : [];
          const videoCandidates = uniqByUrl([
            ...vv.map(v => ({ url: v.url, width: v.width, height: v.height, type: v.type || null })),
            ...videoUrl
          ]);

          const bestImage = imgCandidates.length ? imgCandidates.reduce((a,b)=>((a.width||0)*(a.height||0) >= (b.width||0)*(b.height||0) ? a : b)) : null;
          const bestVideo = videoCandidates.length ? videoCandidates[0] : null;

          return {
            index: idx,
            id: node?.id || node?.pk || null,
            shortcode,
            is_video: isVideo,
            images: imgCandidates,
            videos: videoCandidates,
            best_image: bestImage,
            best_video: bestVideo
          };
        });
      }
    } catch { return null; }
    return null;
  };

  const parseAndPublish = async (url, res) => {
    try {
      const clone = res.clone();
      const ct = (clone.headers.get("content-type") || "").toLowerCase();

      let data = null;
      if (ct.includes("application/json") || ct.includes("text/javascript")) {
        let txt = await clone.text();
        txt = txt.replace(/^for\\s*\\(\\s*;\\s*;\\s*\\)\\s*;?/, "");
        data = JSON.parse(txt);
      } else {
        return;
      }

      const topic = classify(url, data);
      if (!topic) return;
      const shaped = shape(topic, data);
      if (shaped) publish(topic, shaped);
    } catch (e) {
      console.log("[sniffer] parse error", e?.message);
    }
  };

  const _fetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const res = await _fetch.apply(this, arguments);
    if (want(url)) parseAndPublish(url, res);
    return res;
  };

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) { this.__url = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener("load", () => {
      if (!want(this.__url)) return;
      try {
        const blob = new Blob([this.responseText || ""], { type: this.getResponseHeader("content-type") || "application/json" });
        const res = new Response(blob, { headers: { "content-type": blob.type } });
        parseAndPublish(this.__url, res);
      } catch (e) { console.log("[sniffer] xhr wrap error", e?.message); }
    });
    return _send.apply(this, arguments);
  };
})();`;

/* ------------- helpers ------------- */
async function injectIgSniffer(page) {
  await page.evaluateOnNewDocument(IG_SNIFFER);
  console.log("[init] sniffer injected");
}
async function waitForTopic(page, topic, timeoutMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const data = await page.evaluate(k => (window.__IG_CAPTURED__ && window.__IG_CAPTURED__[k]) || null, topic);
    if (data && Array.isArray(data) && data.length) return data;
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

function loadProfilePosts(baseDir, username) {
  const filePath = path.join(baseDir, "profile", username, "profile_posts.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data);
}

// ensure fetch exists in Node <18
const fetch = global.fetch || ((...a) => import("node-fetch").then(({default: f}) => f(...a)));

function uniq(arr) {
  const s = new Set(); const out = [];
  for (const u of arr) { if (!u || s.has(u)) continue; s.add(u); out.push(u); }
  return out;
}

/** Download image from URL and save locally */
async function downloadImage(url, filepath) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return filepath;
  } catch (e) {
    console.warn(`[download] Failed to download ${url}: ${e.message}`);
    return null;
  }
}

/** Download all images for a user's posts */
async function downloadUserImages(user_name) {
  const userDir = path.join("profile_screenshots", user_name);
  const imagesDir = path.join(userDir, "images");
  ensureDir(imagesDir);

  const urls = collectSavedImageUrls(user_name);
  const downloadedPaths = [];

  console.log(`[DOWNLOAD] Downloading ${urls.length} images for ${user_name}`);
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = url.toLowerCase().includes('.png') ? '.png' : '.jpg';
    const filename = `image_${i + 1}${ext}`;
    const filepath = path.join(imagesDir, filename);
    
    if (fs.existsSync(filepath)) {
      console.log(`[SKIP] Image already exists: ${filename}`);
      downloadedPaths.push(filepath);
      continue;
    }
    
    console.log(`[DOWNLOAD ${i + 1}/${urls.length}] ${filename}`);
    const result = await downloadImage(url, filepath);
    if (result) {
      downloadedPaths.push(result);
    }
    await sleep(200); // be polite
  }
  
  return downloadedPaths;
}

/** Read saved profile_posts.json and return image URLs */
function collectSavedImageUrls(user_name) {
  const userDir = path.join("profile_screenshots", user_name);
  const fp = path.join(userDir, "profile_posts.json");
  if (!fs.existsSync(fp)) return [];
  const posts = JSON.parse(fs.readFileSync(fp, "utf8"));

  const urls = [];
  for (const p of posts) {
    if (p.display_url) urls.push(p.display_url);
    if (p.thumbnail_src) urls.push(p.thumbnail_src);

    const car = p.carousel || [];
    for (const item of car) {
      // Collect ALL images from each carousel item, not just best_image
      if (Array.isArray(item?.images)) {
        for (const im of item.images) {
          if (im?.url) urls.push(im.url);
        }
      }
      // Fallback to best_image if no images array
      if (item?.best_image?.url && !Array.isArray(item?.images)) {
        urls.push(item.best_image.url);
      }
      // skip videos for Gemini image endpoint
    }
  }
  return uniq(urls);
}

/** Create profile collage and analyze with Gemini */
async function analyzeProfileCollage(user_name, systemPrompt) {
  const userDir = path.join("profile_screenshots", user_name);
  ensureDir(userDir);

  console.log(`\n[PROFILE_ANALYSIS] Starting analysis for user: ${user_name}`);
  console.log(`[SYSTEM_PROMPT] Using prompt:\n${systemPrompt}\n`);

  try {
    // Step 1: Download all post images
    console.log(`[STEP 1] Downloading post images...`);
    const imagePaths = await downloadUserImages(user_name);
    console.log(`[DOWNLOAD] Downloaded ${imagePaths.length} images`);

    const profileScreenshotPath = path.join(userDir, "profile_screenshot.png");
    const enhancedPrompt = `${systemPrompt}\n\nProfile being analyzed: @${user_name}`;
    let analysisText;
    let imageToAnalyze;
    let analysisType;

    // Check if we have post images or just profile screenshot
    if (imagePaths.length === 0) {
      // Step 2a: No post images - analyze profile screenshot directly
      console.log(`[STEP 2] No post images found. Analyzing profile screenshot directly...`);
      
      if (!fs.existsSync(profileScreenshotPath)) {
        throw new Error(`Profile screenshot not found: ${profileScreenshotPath}`);
      }
      
      imageToAnalyze = profileScreenshotPath;
      analysisType = "profile_only";
      
      console.log(`[STEP 3] Analyzing profile screenshot with Gemini...`);
      analysisText = await image_consult(imageToAnalyze, enhancedPrompt, 5);
      
    } else {
      // Step 2b: Create collage with profile screenshot and post images
      console.log(`[STEP 2] Creating profile collage with ${imagePaths.length} post images...`);
      const collagePath = await createProfileCollage(user_name, profileScreenshotPath, imagePaths);
      
      imageToAnalyze = collagePath;
      analysisType = "collage";
      
      console.log(`[STEP 3] Analyzing collage with Gemini...`);
      analysisText = await image_consult(imageToAnalyze, enhancedPrompt, 5);
    }
    
    console.log(`[GEMINI_RESPONSE] Analysis for ${user_name}:\n${analysisText}\n`);
    
    // Step 4: Save results
    const result = {
      user_name,
      ok: true,
      analysis_type: analysisType,
      image_analyzed: imageToAnalyze,
      profile_screenshot: profileScreenshotPath,
      post_images_count: imagePaths.length,
      analysis: analysisText,
      timestamp: new Date().toISOString()
    };
    
    // Add collage_path only if we created one
    if (analysisType === "collage") {
      result.collage_path = imageToAnalyze;
    }
    
    const outPath = path.join(userDir, "profile_analysis.json");
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`[WRITE] Saved analysis: ${outPath}`);
    
    return result;
    
  } catch (e) {
    console.log(`[ERROR] Failed to analyze collage for ${user_name}: ${e.message}`);
    const errorResult = {
      user_name,
      ok: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
    
    const outPath = path.join(userDir, "collage_analysis.json");
    fs.writeFileSync(outPath, JSON.stringify(errorResult, null, 2));
    
    return errorResult;
  }
}

/** Legacy function - kept for compatibility */
async function analyzeSavedImages(user_name, systemPrompt) {
  console.log(`[DEPRECATED] analyzeSavedImages called - redirecting to analyzeProfileCollage`);
  return await analyzeProfileCollage(user_name, systemPrompt);
}


// DOM fallback extractor runs in the page context
function domExtractorSource() {
  const uniq = (arr, key='url') => {
    const s = new Set(); const out=[];
    for (const x of arr) { const u=x?.[key]; if(!u || s.has(u)) continue; s.add(u); out.push(x); }
    return out;
  };
  const qs = sel => Array.from(document.querySelectorAll(sel));
  const get = prop => document.querySelector(`meta[property="\${prop}"]`)?.content || null;

  const ogImgs = qs('meta[property="og:image"]').map(m => ({ url: m.content }));
  const ogVid = get('og:video:secure_url') || get('og:video') || null;

  const ld = qs('script[type="application/ld+json"]').flatMap(s => {
    try { return [JSON.parse(s.textContent.trim())]; } catch { return []; }
  });
  const imgFromLd = [];
  const vidFromLd = [];
  for (const o of ld) {
    const pushImg = x => { if (typeof x === 'string') imgFromLd.push({ url: x }); else if (x?.url) imgFromLd.push({ url: x.url, width: x.width, height: x.height }); };
    const pushVid = x => { if (typeof x === 'string') vidFromLd.push({ url: x }); else if (x?.contentUrl) vidFromLd.push({ url: x.contentUrl }); };
    if (o?.image) Array.isArray(o.image) ? o.image.forEach(pushImg) : pushImg(o.image);
    if (o?.video) Array.isArray(o.video) ? o.video.forEach(pushVid) : pushVid(o.video);
  }

  const vids = qs('video').flatMap(v => {
    const fromSrc = v.currentSrc || v.src || null;
    const fromSources = Array.from(v.querySelectorAll('source')).map(s => s.src).filter(Boolean);
    return [fromSrc, ...fromSources].filter(Boolean).map(u => ({ url: u }));
  });

  const images = uniq([...ogImgs, ...imgFromLd].filter(Boolean));
  const videos = uniq([...(ogVid ? [{ url: ogVid }] : []), ...vidFromLd, ...vids].filter(Boolean));

  const bestImg = images.length
    ? images.reduce((a, b) => {
        const aa = (a.width||0)*(a.height||0);
        const bb = (b.width||0)*(b.height||0);
        return bb > aa ? b : a;
      })
    : null;

  const codeMatch = location.pathname.split('/').filter(Boolean)[1] || null;
  if (!images.length && !videos.length) return [];
  return [{
    index: 0,
    id: null,
    shortcode: codeMatch,
    is_video: !!videos[0],
    images,
    videos,
    best_image: bestImg,
    best_video: videos[0] || null
  }];
}

/** Create a collage from profile screenshot and post images */
async function createProfileCollage(user_name, profileScreenshotPath, imagePaths) {
  console.log(`[COLLAGE] Creating collage for ${user_name}`);
  
  const userDir = path.join("profile_screenshots", user_name);
  const collagePath = path.join(userDir, "profile_collage.jpg");
  
  // Load all images
  const images = [];
  
  // Load profile screenshot first
  console.log(`[COLLAGE] Looking for profile screenshot: ${profileScreenshotPath}`);
  if (fs.existsSync(profileScreenshotPath)) {
    try {
      const profileImg = await loadImage(profileScreenshotPath);
      images.push({ img: profileImg, type: 'profile' });
      console.log(`[COLLAGE] ✅ Loaded profile screenshot: ${profileImg.width}x${profileImg.height}`);
    } catch (e) {
      console.warn(`[COLLAGE] ❌ Failed to load profile screenshot: ${e.message}`);
    }
  } else {
    console.warn(`[COLLAGE] ❌ Profile screenshot not found: ${profileScreenshotPath}`);
  }
  
  // Load post images
  for (const imgPath of imagePaths) {
    if (fs.existsSync(imgPath)) {
      try {
        const img = await loadImage(imgPath);
        images.push({ img, type: 'post' });
      } catch (e) {
        console.warn(`[COLLAGE] Failed to load image ${imgPath}: ${e.message}`);
      }
    }
  }
  
  if (images.length === 0) {
    throw new Error('No images loaded for collage');
  }
  
  console.log(`[COLLAGE] Loaded ${images.length} images total`);
  
  // Calculate collage dimensions
  const maxWidth = 1920;
  const padding = 20;
  const profileImg = images.find(i => i.type === 'profile');
  const profileHeight = profileImg ? Math.min(600, profileImg.img.height * (maxWidth / profileImg.img.width)) : 0;
  
  // Calculate grid for post images
  const postImages = images.filter(i => i.type === 'post');
  const cols = Math.min(4, Math.ceil(Math.sqrt(postImages.length)));
  const rows = Math.ceil(postImages.length / cols);
  
  const cellWidth = Math.floor((maxWidth - padding * (cols + 1)) / cols);
  const cellHeight = cellWidth; // square cells
  
  const canvasWidth = maxWidth;
  const canvasHeight = profileHeight + (rows * cellHeight) + padding * (rows + 2);
  
  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  let yOffset = padding;
  
  // Draw profile screenshot at top
  const profileImage = images.find(i => i.type === 'profile');
  if (profileImage) {
    const img = profileImage.img;
    const scaleFactor = Math.min(maxWidth / img.width, profileHeight / img.height);
    const scaledWidth = img.width * scaleFactor;
    const scaledHeight = img.height * scaleFactor;
    const xOffset = (canvasWidth - scaledWidth) / 2;
    
    console.log(`[COLLAGE] Drawing profile screenshot: ${scaledWidth}x${scaledHeight} at (${xOffset}, ${yOffset})`);
    ctx.drawImage(img, xOffset, yOffset, scaledWidth, scaledHeight);
    yOffset += scaledHeight + padding;
    
    // Add separator line
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padding, yOffset);
    ctx.lineTo(canvasWidth - padding, yOffset);
    ctx.stroke();
    yOffset += padding;
    
    // Add "PROFILE" label
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('PROFILE SCREENSHOT', padding, yOffset - 10);
  } else {
    console.warn(`[COLLAGE] No profile screenshot available for ${user_name}`);
    // Add placeholder text
    ctx.fillStyle = '#cccccc';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Profile screenshot not available', canvasWidth / 2, yOffset + 30);
    yOffset += 60;
  }
  
  // Draw post images in grid
  for (let i = 0; i < postImages.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    const x = padding + col * (cellWidth + padding);
    const y = yOffset + row * (cellHeight + padding);
    
    const img = postImages[i].img;
    const scale = Math.min(cellWidth / img.width, cellHeight / img.height);
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    
    const centerX = x + (cellWidth - scaledWidth) / 2;
    const centerY = y + (cellHeight - scaledHeight) / 2;
    
    ctx.drawImage(img, centerX, centerY, scaledWidth, scaledHeight);
    
    // Draw border
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellWidth, cellHeight);
  }
  
  // Add main title
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`@${user_name}`, canvasWidth / 2, 35);
  
  // Add posts label above grid
  if (postImages.length > 0) {
    const postsLabelY = profileImage ? yOffset - 5 : yOffset + 40;
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`POSTS (${postImages.length} images)`, padding, postsLabelY);
  }
  
  // Save collage
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
  fs.writeFileSync(collagePath, buffer);
  
  console.log(`[COLLAGE] Saved collage: ${collagePath} (${canvasWidth}x${canvasHeight})`);
  return collagePath;
}

/* ------------- core (intercept only) ------------- */
async function scrape_image(url, user_name, load_delay) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: ["--disable-notifications"]
  });
  console.log("[env] puppeteer", require("puppeteer/package.json").version);

  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  page.on("response", r => {
    const u = r.url();
    if (u.includes("/graphql") || u.includes("/api/v1/media/") || u.includes("/api/v1/clips/")) {
      console.log("[resp]", r.status(), (r.headers()["content-type"] || ""), u.slice(0, 160));
    }
  });

  await injectIgSniffer(page);
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

  console.log("[profile] goto", url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  if (await page.$('input[name="username"]')) throw new Error("login wall");
  console.log("[profile] loaded]");

  const userDir = path.join("profile_screenshots", user_name);
  const imagesDir = path.join(userDir, "images");
  ensureDir(userDir);
  ensureDir(imagesDir);

  // Wait for profile to fully load before taking screenshot
  await sleep(3000); // 3 second delay for profile to load completely
  
  // Take profile screenshot at top of page first
  const profileScreenshotPath = path.join(userDir, "profile_screenshot.png");
  const profileScreenshotImagesPath = path.join(imagesDir, "profile_screenshot.png");
  
  await page.screenshot({ path: profileScreenshotPath, fullPage: false });
  console.log(`[SCREENSHOT] Profile screenshot saved: ${profileScreenshotPath}`);
  
  // Also save a copy in the images subdirectory
  fs.copyFileSync(profileScreenshotPath, profileScreenshotImagesPath);
  console.log(`[SCREENSHOT] Profile screenshot also saved in images directory: ${profileScreenshotImagesPath}`);

  await page.evaluate(() => window.scrollBy(0, 0));
  await sleep(load_delay + 3000);

  let capturedPosts = await waitForTopic(page, "profile_posts", 25000);
  console.log("[capture] profile_posts:", capturedPosts?.length ?? 0);

  const capturedHighlights = await waitForTopic(page, "highlights", 20000);
  console.log("[capture] highlights:", capturedHighlights?.length ?? 0);

  if (capturedPosts) fs.writeFileSync(path.join(userDir, "profile_posts.json"), JSON.stringify(capturedPosts, null, 2));
  if (capturedHighlights) fs.writeFileSync(path.join(userDir, "highlights.json"), JSON.stringify(capturedHighlights, null, 2));

  const byCode = new Map((capturedPosts || []).filter(p => p.shortcode).map(p => [p.shortcode, p]));

  const postUrls = (capturedPosts || [])
    .filter(p => p.shortcode)
    .map(p => {
      const isReel = (p.product_type === "clips") || (p.__typename === "GraphVideo" && p.is_video);
      const seg = isReel ? "reel" : "p";
      return `https://www.instagram.com/${seg}/${p.shortcode}/`;
    });

  console.log("[targets] posts:", postUrls.length);

  for (const postUrl of postUrls) {
    const code = shortcodeFromUrl(postUrl);

    await page.evaluate(() => { window.__IG_CAPTURED__ = window.__IG_CAPTURED__ || {}; window.__IG_CAPTURED__.post_carousel = null; });
    console.log("[post] reset topic", code);

    console.log("[post] goto", postUrl);
    await page.goto(postUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(800);
    if (await page.$('input[name="username"]')) { console.log("[post] login wall"); continue; }

    // Force a detail request so sniffer sees it (ignore errors)
    await page.evaluate((shortcode) => {
      const detail = `/api/v1/media/shortcode/${shortcode}/?children=true`;
      return fetch(detail, { credentials: "include" }).catch(() => {});
    }, code);

    // Try sniffer first
    let carousel = await waitForTopic(page, "post_carousel", 5000);

    // DOM fallback if needed
    if (!carousel || !carousel.length) {
      carousel = await page.evaluate(`(${domExtractorSource.toString()})()`);
    }

    console.log("[carousel]", code, "slides:", Array.isArray(carousel) ? carousel.length : 0);

    if (carousel?.length) {
      if (byCode.has(code)) {
        byCode.get(code).carousel = carousel;
        console.log("[merge] added to", code);
      } else {
        const minimal = { shortcode: code, carousel };
        capturedPosts = capturedPosts || [];
        capturedPosts.push(minimal);
        byCode.set(code, minimal);
        console.log("[merge] created minimal for", code);
      }
    } else {
      console.log("[carousel] none for", code);
    }
  }

  if (capturedPosts) {
    fs.writeFileSync(path.join(userDir, "profile_posts.json"), JSON.stringify(capturedPosts, null, 2));
    console.log("[write] profile_posts.json updated");
  }

  await browser.close();
  console.log("[done]", user_name);

  return { profile_posts: capturedPosts || [], highlights: capturedHighlights || [] };
}

/* ------------- follower diff + io ------------- */
function poi_search(pre, post) {
  const n = [], l = [];
  const has = (set, obj) => [...set].some(o => JSON.stringify(o) === JSON.stringify(obj));
  const A = new Set(pre), B = new Set(post);
  for (const x of post) if (!has(A, x)) n.push(x);
  for (const x of pre) if (!has(B, x)) l.push(x);
  return { new: n, lost: l };
}
function parse_data(p) {
  const raw = fs.readFileSync(p, "utf8");
  const data = JSON.parse(raw);
  return data.map(d => ({ username: d.string_list_data[0].value, url: d.string_list_data[0].href }));
}

/**
 * Send an image and a system prompt to Gemini
 * @param {string} imagePath - path to PNG/JPG file
 * @param {string} systemPrompt - instruction for Gemini
 * @param {number} [maxRetries=5] - number of retry attempts
 * @returns {Promise<string>} - Gemini response text
 */
/**
 * Send an image (file path or URL) and a system prompt to Gemini
 * @param {string} imagePathOrUrl - path to PNG/JPG file or URL
 * @param {string} systemPrompt - instruction for Gemini
 * @param {number} [maxRetries=5] - number of retry attempts
 * @returns {Promise<string>} - Gemini response text
 */
async function image_consult(imagePathOrUrl, systemPrompt, maxRetries = 5) {
  const isUrl = /^https?:\/\//i.test(imagePathOrUrl);
  let mimeType;
  let base64;

  console.log(`[API_CALL] Preparing Gemini request for: ${imagePathOrUrl}`);

  if (isUrl) {
    console.log(`[FETCH] Downloading image from URL...`);
    const res = await fetch(imagePathOrUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    base64 = Buffer.from(arrayBuffer).toString("base64");

    // infer mime from headers or url extension
    mimeType =
      res.headers.get("content-type") ||
      (imagePathOrUrl.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg");
    console.log(`[IMAGE_DATA] MIME type: ${mimeType}, Base64 length: ${base64.length} chars`);
  } else {
    console.log(`[FILE] Reading local image file...`);
    mimeType = path.extname(imagePathOrUrl).toLowerCase() === ".png"
      ? "image/png"
      : "image/jpeg";
    base64 = fs.readFileSync(imagePathOrUrl).toString("base64");
    console.log(`[IMAGE_DATA] MIME type: ${mimeType}, Base64 length: ${base64.length} chars`);
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      console.log(`[GEMINI] Sending request (attempt ${attempt + 1}/${maxRetries})...`);
      
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
      });

      const requestData = {
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: base64 } }],
          },
        ],
      };

      console.log(`[REQUEST_STRUCTURE] Model: gemini-2.5-flash, Content parts: 1 image (${mimeType})`);

      const result = await model.generateContent(requestData);

      if (result.response.promptFeedback?.blockReason) {
        throw new Error(`Blocked: ${result.response.promptFeedback.blockReason}`);
      }

      console.log(`[SUCCESS] Received response from Gemini`);
      return result.response.text();
    } catch (err) {
      attempt++;
      const wait = 1000 * attempt;
      console.warn(
        `[RETRY] image_consult retry ${attempt}/${maxRetries} after ${wait}ms → ${err.message}`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw new Error(`image_consult failed after ${maxRetries} retries`);
}

function readSystemPrompt() {
  const fp = path.join("prompts", "general_info_prompt.txt");
  if (!fs.existsSync(fp)) throw new Error(`Missing prompt file: ${fp}`);
  return fs.readFileSync(fp, "utf8").trim();
}

/* ------------- main ------------- */
async function main() {
console.log("[start] diff followers");
  const pre_campaign_data = parse_data(TEST_DATA_LOCATION_PRE);
  const post_campaign_data = parse_data(TEST_DATA_LOCATION);
  const poi = poi_search(pre_campaign_data, post_campaign_data);
  console.log("[poi] new:", poi.new.length, "lost:", poi.lost.length);

  const toProcess = [...poi.new, ...poi.lost].slice(0, 3); // limit to first 3 for testing

  let users = []

  const SYSTEM_PROMPT = readSystemPrompt();
  
  // First scrape profiles if needed (uncomment to enable scraping)
  for (const u of toProcess) {
    console.log("[scrape] user", u.username, u.url);
    await scrape_image(u.url, u.username, 800);
  }
  
  // Then create collages and analyze
  for (const u of toProcess) {
    console.log(`[analyze] Processing user: ${u.username}`);
    const result = await analyzeProfileCollage(u.username, SYSTEM_PROMPT);
    users.push(result);
  }

  // Summary of results
  console.log(`\n[SUMMARY] Processed ${users.length} users:`);
  const successful = users.filter(u => u.ok);
  const failed = users.filter(u => !u.ok);
  
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  
  if (successful.length > 0) {
    console.log(`\n[SUCCESSFUL_ANALYSES]:`);
    successful.forEach(u => {
      console.log(`- ${u.user_name}: ${u.post_images_count} images in collage`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n[FAILED_ANALYSES]:`);
    failed.forEach(u => {
      console.log(`- ${u.user_name}: ${u.error}`);
    });
  }
  
  console.log(users)

  console.log("[finish]");
}

/* ------------- test function ------------- */
async function testSingleProfile(profileUrl) {
  console.log(`[TEST] Starting test for profile: ${profileUrl}`);
  
  // Extract username from URL
  const username = profileUrl.split('/').filter(Boolean).pop() || 'unknown';
  console.log(`[TEST] Extracted username: ${username}`);
  
  const SYSTEM_PROMPT = readSystemPrompt();
  
  try {
    // Step 1: Scrape the profile
    console.log(`[TEST] Step 1: Scraping profile...`);
    await scrape_image(profileUrl, username, 800);
    
    // Step 2: Analyze the profile collage
    console.log(`[TEST] Step 2: Creating collage and analyzing...`);
    const result = await analyzeProfileCollage(username, SYSTEM_PROMPT);
    
    // Step 3: Show results
    console.log(`\n[TEST_RESULTS] Analysis complete for ${username}:`);
    if (result.ok) {
      console.log(`✅ Success: ${result.post_images_count} images processed`);
      console.log(`📁 Collage saved: ${result.collage_path}`);
      console.log(`📸 Profile screenshot: ${result.profile_screenshot}`);
      console.log(`🤖 Analysis: ${result.analysis.substring(0, 200)}...`);
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`[TEST_ERROR] Failed to process ${username}: ${error.message}`);
    return { username, ok: false, error: error.message };
  }
}

// Test the specific profile
testSingleProfile('https://www.instagram.com/hffguwemu/');

// Original main function (commented out for testing)
// main();
