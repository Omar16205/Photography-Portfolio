/* ============================================
   OMAR’S LENS — Optimized Firebase Gallery JS
   Keeps old collection style.
   Public site loads Firestore only.
   NO Firebase Storage scanning on public pages.
   Includes:
   - faster initial gallery rendering
   - smaller show-more batches
   - hidden mobile collection scrollbar
   - desktop collection arrow buttons
   - manual home hero image from index.html
   ============================================ */

import { firebaseConfig, FIREBASE_IS_CONFIGURED } from './firebase-config.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';

import {
  getFirestore,
  collection,
  getDocs,
  orderBy,
  query
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

(function () {
  'use strict';

  let allPhotos = [];

  /* ============================================
     SVG SPRITE
     ============================================ */
  const sprite = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <symbol id="ks" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="14" fill="currentColor"/>
        <path d="M48.88,34.04 L50.00,4.00 L51.12,34.04 Z M53.64,34.42 L63.56,6.04 L55.77,35.08 Z M58.07,36.18 L75.91,11.99 L59.91,37.44 Z M61.78,39.18 L85.96,21.32 L63.17,40.92 Z M64.45,43.13 L92.82,33.19 L65.27,45.21 Z M65.83,47.69 L95.87,46.56 L66.00,49.92 Z M65.81,52.46 L94.85,60.24 L65.31,54.64 Z M64.38,57.01 L89.84,73.00 L63.26,58.95 Z M61.67,60.94 L81.29,83.72 L60.04,62.46 Z M57.93,63.90 L69.96,91.44 L55.92,64.86 Z M53.48,65.62 L56.86,95.49 L51.28,65.95 Z M48.72,65.95 L43.14,95.49 L46.52,65.62 Z M44.08,64.86 L30.04,91.44 L42.07,63.90 Z M39.96,62.46 L18.71,83.72 L38.33,60.94 Z M36.74,58.95 L10.16,73.00 L35.62,57.01 Z M34.69,54.64 L5.15,60.24 L34.19,52.46 Z M34.00,49.92 L4.13,46.56 L34.17,47.69 Z M34.73,45.21 L7.18,33.19 L35.55,43.13 Z M36.83,40.92 L14.04,21.32 L38.22,39.18 Z M40.09,37.44 L24.09,11.99 L41.93,36.18 Z M44.23,35.08 L36.44,6.04 L46.36,34.42 Z" fill="currentColor"/>
      </symbol>
    </svg>
  `;

  document.body.insertAdjacentHTML('afterbegin', sprite);

  /* ============================================
     THEME TOGGLE
     ============================================ */
  const root = document.documentElement;
  const themeBtn = document.querySelector('.theme-toggle');
  const savedTheme = localStorage.getItem('lok-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  root.setAttribute('data-theme', savedTheme || (prefersDark ? 'dark' : 'light'));

  themeBtn?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('lok-theme', next);
  });

  /* ============================================
     MOBILE MENU / HEADER
     ============================================ */
  const menuButton = document.querySelector('.hamburger');

  menuButton?.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('menu-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });

  document.querySelectorAll('.nav-main a').forEach(link => {
    link.addEventListener('click', () => {
      document.body.classList.remove('menu-open');
      menuButton?.setAttribute('aria-expanded', 'false');
    });
  });

  const header = document.querySelector('.site-header');

  if (header) {
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 30);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================
     REVEAL ANIMATIONS
     ============================================ */
  function revealVisible() {
    const reveals = document.querySelectorAll('.reveal:not(.in)');

    if ('IntersectionObserver' in window && reveals.length) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.12,
        rootMargin: '0px 0px -60px 0px'
      });

      reveals.forEach(el => io.observe(el));
    } else {
      reveals.forEach(el => el.classList.add('in'));
    }
  }

  /* ============================================
     HELPERS
     ============================================ */
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function safeCssEscape(value = '') {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  }

  function getDisplayTitle(photo = {}) {
    return photo.name || photo.title || 'Untitled';
  }

  function getCaption(photo = {}) {
    return photo.caption || photo.dateLabel || photo.location || '';
  }

  function getDescription(photo = {}) {
    if (photo.showDescription === false) return '';
    return photo.description || photo.story || '';
  }

  function getThumbSrc(photo = {}) {
    return photo.thumbUrl || photo.thumbnailUrl || photo.imageUrl || photo.fullUrl || '';
  }

  function getFullSrc(photo = {}) {
    return photo.fullUrl || photo.imageUrl || photo.thumbUrl || photo.thumbnailUrl || '';
  }

  function imageAttrs(photo = {}, index = 0, eager = false) {
    const src = getThumbSrc(photo);
    const alt = photo.alt || getDisplayTitle(photo);
    const loading = eager ? 'eager' : 'lazy';
    const priority = eager ? ' fetchpriority="high"' : '';

    return `src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="${loading}" decoding="async"${priority}`;
  }

  function displayMode(photo = {}, index = 0) {
    if (photo.display) return photo.display;
    if (photo.layout) return photo.layout;
    if (index === 0) return 'lead';
    if (index % 7 === 0) return 'postcard';
    return 'plain';
  }

  function orientationClass(photo = {}) {
    if (photo.orientation === 'portrait') return 'portrait';
    if (photo.orientation === 'square') return 'square';
    return 'landscape';
  }

  function photoClasses(photo = {}, index = 0) {
    const mode = displayMode(photo, index);

    const classes = [
      'archive-photo',
      `is-${mode}`,
      orientationClass(photo)
    ];

    if (mode === 'postcard') {
      classes.push('postcard');
      classes.push(index % 2 ? 'tilt-r' : 'tilt-l');
    }

    if (
      photo.layout === 'large' ||
      photo.featuredInCollection ||
      photo.spanWide ||
      (index === 0 && mode !== 'plain')
    ) {
      classes.push('span-wide');
    }

    return classes.join(' ');
  }

  /* ============================================
     FIREBASE LOAD — FIRESTORE ONLY
     ============================================ */
  async function loadPhotos() {
    if (!FIREBASE_IS_CONFIGURED) {
      console.error('Firebase is not configured.');
      return [];
    }

    try {
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);

      const photosQuery = query(
        collection(db, 'photos'),
        orderBy('order', 'asc')
      );

      const snap = await getDocs(photosQuery);

      const photos = snap.docs
        .map(docSnap => {
          const data = {
            id: docSnap.id,
            ...docSnap.data()
          };

          return {
            ...data,

            collectionId: data.collectionId || data.sectionId || 'loose-frames',
            collectionTitle: data.collectionTitle || data.sectionTitle || 'Loose Frames',
            collectionKind: data.collectionKind || 'mixed',
            collectionNote: data.collectionNote || '',

            title: data.title || data.name || 'Untitled',
            name: data.name || data.title || 'Untitled',
            caption: data.caption || data.dateLabel || data.location || '',
            dateLabel: data.dateLabel || data.caption || '',
            description: data.description || data.story || '',
            story: data.story || data.description || '',
            showDescription: data.showDescription !== false,

            display: data.display || 'plain',
            orientation: data.orientation || 'landscape',
            order: Number(data.order || 9999),

            featured: Boolean(data.featured),
            hero: Boolean(data.hero),
            header: Boolean(data.header),
            heroInCollection: Boolean(data.heroInCollection),

            imageUrl: data.imageUrl || data.fullUrl || data.thumbUrl || '',
            thumbUrl: data.thumbUrl || data.thumbnailUrl || data.imageUrl || '',
            fullUrl: data.fullUrl || data.imageUrl || data.thumbUrl || '',

            location: data.location || '',
            stamp: data.stamp || data.location || data.collectionTitle || '',
            tags: Array.isArray(data.tags) ? data.tags : []
          };
        })
        .filter(photo => photo.imageUrl || photo.thumbUrl)
        .sort((a, b) => {
          const collectionCompare = String(a.collectionId).localeCompare(String(b.collectionId));

          if (collectionCompare !== 0) return collectionCompare;

          return Number(a.order || 9999) - Number(b.order || 9999);
        });

      return photos;
    } catch (error) {
      console.error('Could not load Firestore photo metadata:', error);
      return [];
    }
  }

  /* ============================================
     GROUP PHOTOS INTO COLLECTIONS
     ============================================ */
  function groupByCollection(photos = []) {
    const map = new Map();

    photos.forEach(photo => {
      const id = photo.collectionId || 'loose-frames';

      if (!map.has(id)) {
        map.set(id, {
          id,
          title: photo.collectionTitle || 'Loose Frames',
          note: photo.collectionNote || '',
          kind: photo.collectionKind || 'mixed',
          photos: []
        });
      }

      const collectionItem = map.get(id);

      collectionItem.photos.push(photo);

      if (photo.collectionTitle) {
        collectionItem.title = photo.collectionTitle;
      }

      if (photo.collectionNote) {
        collectionItem.note = photo.collectionNote;
      }

      if (photo.collectionKind) {
        collectionItem.kind = photo.collectionKind;
      }
    });

    return [...map.values()]
      .map(col => {
        col.photos.sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999));
        return col;
      })
      .sort((a, b) => {
        const aOrder = Math.min(...a.photos.map(p => Number(p.order || 9999)));
        const bOrder = Math.min(...b.photos.map(p => Number(p.order || 9999)));
        return aOrder - bOrder;
      });
  }

  /* ============================================
     PHOTO CARD
     ============================================ */
  function photoCard(photo, index = 0) {
    const mode = displayMode(photo, index);
    const title = getDisplayTitle(photo);
    const captionText = getCaption(photo);
    const description = getDescription(photo);

    if (mode === 'postcard') {
      return `
        <article class="${photoClasses(photo, index)}" data-cat="${escapeHtml((photo.tags || []).join(' '))}" data-photo-id="${escapeHtml(photo.id)}">
          <div class="postcard-img">
            <span class="postcard-stamp">${escapeHtml(photo.stamp || photo.location || photo.collectionTitle || 'Photo')}</span>
            <img ${imageAttrs(photo, index)} />
          </div>

          <div class="postcard-caption">
            <span class="title">${escapeHtml(title)}</span>
            ${captionText ? `<span class="meta">${escapeHtml(captionText)}</span>` : ''}
          </div>
        </article>
      `;
    }

    return `
      <figure class="${photoClasses(photo, index)}" data-cat="${escapeHtml((photo.tags || []).join(' '))}" data-photo-id="${escapeHtml(photo.id)}">
        <img ${imageAttrs(photo, index)} />

        <figcaption class="archive-caption">
          <span class="title">${escapeHtml(title)}</span>
          ${captionText ? `<span class="meta">${escapeHtml(captionText)}</span>` : ''}
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
        </figcaption>
      </figure>
    `;
  }

  /* ============================================
     HOME PAGE RENDER
     Firebase only fills the featured grid.
     Hero image stays manual from index.html.
     ============================================ */
  function renderHome(photos = []) {
    const featuredGrid = document.getElementById('featuredGrid');

    if (!featuredGrid) return;

    const usablePhotos = photos.filter(photo => getThumbSrc(photo));
    const featured = usablePhotos.filter(photo => photo.featured).slice(0, 6);
    const finalFeatured = featured.length ? featured : usablePhotos.slice(0, 6);

    if (!finalFeatured.length) {
      featuredGrid.innerHTML = `
        <div class="gallery-loading">
          No featured photos found yet. Open admin.html and save photo metadata.
        </div>
      `;
      return;
    }

    featuredGrid.innerHTML = finalFeatured.map((photo, i) => {
      return `
        <article class="postcard ${i % 2 ? 'tilt-r' : 'tilt-l'} ${photo.orientation === 'portrait' ? 'tall' : 'wide'}" data-photo-id="${escapeHtml(photo.id)}">
          <div class="postcard-img">
            <span class="postcard-stamp">${escapeHtml(photo.stamp || photo.location || 'Photo')}</span>
            <img ${imageAttrs(photo, i, i === 0)} />
          </div>

          <div class="postcard-caption">
            <span class="title">${escapeHtml(getDisplayTitle(photo))}</span>
            <span class="meta">${escapeHtml(getCaption(photo))}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  /* ============================================
     FILTERS
     ============================================ */
  function renderFilters(collections = [], photos = []) {
    const filters = document.getElementById('collectionFilters');
    if (!filters) return;

    filters.innerHTML = `
      <button class="active" data-filter="all">All <span class="count">· ${photos.length}</span></button>
      ${collections.map(col => `
        <button data-filter="${escapeHtml(col.id)}">
          ${escapeHtml(col.title)}
          <span class="count">· ${col.photos.length}</span>
        </button>
      `).join('')}
    `;

    const applyFilter = filter => {
      filters.querySelectorAll('button').forEach(button => {
        button.classList.toggle('active', button.dataset.filter === filter);
      });

      document.querySelectorAll('.collection-block').forEach(block => {
        block.classList.toggle('hidden', filter !== 'all' && block.dataset.collection !== filter);
      });

      document.querySelectorAll('.shelf-card').forEach(card => {
        card.classList.toggle('active', card.dataset.filter === filter);
      });

      updateShelfArrows();
    };

    filters.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        applyFilter(button.dataset.filter);
      });
    });

    document.querySelectorAll('.shelf-card').forEach(card => {
      card.addEventListener('click', () => {
        applyFilter(card.dataset.filter);

        document.getElementById('collectionsWrap')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      });
    });
  }

  /* ============================================
     COLLECTION SHELF WITH DESKTOP ARROWS
     ============================================ */
  function updateShelfArrows() {
    const shelf = document.getElementById('collectionShelf');
    if (!shelf) return;

    const shell = shelf.parentElement;
    if (!shell || !shell.classList.contains('collection-shelf-shell')) return;

    const prevBtn = shell.querySelector('.shelf-nav.prev');
    const nextBtn = shell.querySelector('.shelf-nav.next');

    const maxScroll = shelf.scrollWidth - shelf.clientWidth;
    const current = shelf.scrollLeft;

    if (prevBtn) {
      prevBtn.style.opacity = current <= 8 ? '0.35' : '1';
      prevBtn.style.pointerEvents = current <= 8 ? 'none' : 'auto';
    }

    if (nextBtn) {
      nextBtn.style.opacity = current >= maxScroll - 8 ? '0.35' : '1';
      nextBtn.style.pointerEvents = current >= maxScroll - 8 ? 'none' : 'auto';
    }
  }

  function renderCollectionShelf(collections = []) {
    const shelf = document.getElementById('collectionShelf');
    if (!shelf) return;

    shelf.innerHTML = collections.map(col => {
      const cover =
        col.photos.find(photo => photo.header) ||
        col.photos.find(photo => displayMode(photo) === 'lead') ||
        col.photos[0];

      return `
        <button class="shelf-card" data-filter="${escapeHtml(col.id)}">
          <img ${imageAttrs(cover, 0)} />
          <span>${escapeHtml(col.title)}</span>
          <small>${col.photos.length} photos</small>
        </button>
      `;
    }).join('');

    if (!shelf.parentElement.classList.contains('collection-shelf-shell')) {
      const shell = document.createElement('div');
      shell.className = 'collection-shelf-shell';

      shelf.parentNode.insertBefore(shell, shelf);
      shell.appendChild(shelf);

      shell.insertAdjacentHTML('beforeend', `
        <div class="shelf-fade-left" aria-hidden="true"></div>
        <div class="shelf-fade-right" aria-hidden="true"></div>

        <button class="shelf-nav prev" type="button" aria-label="Previous collections">
          <span>‹</span>
        </button>

        <button class="shelf-nav next" type="button" aria-label="Next collections">
          <span>›</span>
        </button>
      `);
    }

    const shell = shelf.parentElement;
    const prevBtn = shell.querySelector('.shelf-nav.prev');
    const nextBtn = shell.querySelector('.shelf-nav.next');

    const scrollShelf = direction => {
      const amount = Math.max(280, shelf.clientWidth * 0.72);

      shelf.scrollBy({
        left: direction * amount,
        behavior: 'smooth'
      });
    };

    if (prevBtn && prevBtn.dataset.bound !== 'true') {
      prevBtn.dataset.bound = 'true';
      prevBtn.addEventListener('click', () => scrollShelf(-1));
    }

    if (nextBtn && nextBtn.dataset.bound !== 'true') {
      nextBtn.dataset.bound = 'true';
      nextBtn.addEventListener('click', () => scrollShelf(1));
    }

    if (shelf.dataset.arrowBound !== 'true') {
      shelf.dataset.arrowBound = 'true';
      shelf.addEventListener('scroll', updateShelfArrows, { passive: true });
      window.addEventListener('resize', updateShelfArrows);
    }

    requestAnimationFrame(updateShelfArrows);
  }

  /* ============================================
     SHOW MORE PHOTOS
     ============================================ */
  function renderMorePhotos(block, col, alreadyShown) {
    const grid = block.querySelector('.archive-grid');
    if (!grid) return;

    const photosWithoutLead = col.photos.filter(photo => photo.id !== (col.leadId || ''));
    const next = photosWithoutLead.slice(alreadyShown, alreadyShown + col.batchSize);

    grid.insertAdjacentHTML(
      'beforeend',
      next.map((photo, i) => photoCard(photo, alreadyShown + i + 1)).join('')
    );

    block.dataset.shown = String(alreadyShown + next.length);

    setupLightbox();
    revealVisible();

    const remaining = photosWithoutLead.length - Number(block.dataset.shown || 0);
    const button = block.querySelector('.show-more');

    if (button && remaining > 0) {
      button.innerHTML = `
        Show ${remaining} more from ${escapeHtml(col.title)}
        <span class="arrow"></span>
      `;
    } else {
      button?.closest('.show-more-row')?.remove();
    }
  }

  /* ============================================
     GALLERY PAGE RENDER
     ============================================ */
  function renderGallery(photos = []) {
    const wrap = document.getElementById('collectionsWrap');
    if (!wrap) return;

    const usablePhotos = photos.filter(photo => getThumbSrc(photo));

    if (!usablePhotos.length) {
      wrap.innerHTML = `
        <div class="gallery-loading">
          No Firestore photo documents found yet. Open admin.html, select photos, and click Save photo metadata.
        </div>
      `;

      const filters = document.getElementById('collectionFilters');

      if (filters) {
        filters.innerHTML = `<button class="active" data-filter="all">All <span class="count">· 0</span></button>`;
      }

      const shelf = document.getElementById('collectionShelf');

      if (shelf) shelf.innerHTML = '';

      return;
    }

    const collections = groupByCollection(usablePhotos);
    const collectionData = new Map();

    renderCollectionShelf(collections);
    renderFilters(collections, usablePhotos);

    wrap.innerHTML = collections.map((col, colIndex) => {
      const lead =
        col.photos.find(photo => photo.header) ||
        col.photos.find(photo => photo.heroInCollection) ||
        col.photos.find(photo => displayMode(photo) === 'lead') ||
        col.photos[0];

      const rest = col.photos.filter(photo => photo.id !== lead.id);

      const initialCount = Number(col.photos.find(photo => photo.initialCount)?.initialCount || 3);
      const batchSize = Number(col.photos.find(photo => photo.batchSize)?.batchSize || 6);

      const shown = rest.slice(0, initialCount);
      const remaining = rest.length - shown.length;

      const layoutClass =
        col.kind === 'wall'
          ? 'photo-wall'
          : col.kind === 'postcards'
            ? 'postcard-wall'
            : 'mixed-wall';

      collectionData.set(col.id, {
        ...col,
        leadId: lead.id,
        batchSize
      });

      const leadDescription = getDescription(lead);

      return `
        <section class="collection-block reveal ${colIndex ? 'collection-divider' : ''}" data-collection="${escapeHtml(col.id)}" data-shown="${shown.length}">
          <div class="collection-intro ${col.kind === 'wall' ? 'intro-minimal' : ''}">
            <div class="collection-copy">
              <div class="eyebrow">Collection · ${String(col.photos.length).padStart(2, '0')} photographs</div>
              <h2 class="display">${escapeHtml(col.title)}</h2>
              ${col.note ? `<p>${escapeHtml(col.note)}</p>` : ''}
              ${leadDescription ? `<blockquote class="pull">${escapeHtml(leadDescription)}</blockquote>` : ''}
            </div>

            <figure class="collection-lead ${orientationClass(lead)}" data-photo-id="${escapeHtml(lead.id)}">
              <img ${imageAttrs(lead, 0, colIndex === 0)} />
              <figcaption>
                <span>${escapeHtml(getDisplayTitle(lead))}</span>
                ${getCaption(lead) ? `<small>${escapeHtml(getCaption(lead))}</small>` : ''}
              </figcaption>
            </figure>
          </div>

          <div class="archive-grid ${layoutClass}" data-hidden-count="${remaining}">
            ${shown.map((photo, i) => photoCard(photo, i + 1)).join('')}
          </div>

          ${remaining > 0 ? `
            <div class="show-more-row">
              <button class="btn btn-ghost show-more" data-more="${escapeHtml(col.id)}">
                Show ${remaining} more from ${escapeHtml(col.title)}
                <span class="arrow"></span>
              </button>
            </div>
          ` : ''}
        </section>
      `;
    }).join('');

    document.querySelectorAll('.show-more').forEach(button => {
      button.addEventListener('click', () => {
        const collectionId = button.dataset.more;
        const col = collectionData.get(collectionId);
        const block = document.querySelector(`.collection-block[data-collection="${safeCssEscape(collectionId)}"]`);

        if (!col || !block) return;

        renderMorePhotos(block, col, Number(block.dataset.shown || 0));
      });
    });
  }

  /* ============================================
     LIGHTBOX
     ============================================ */
  function setupLightbox() {
    const lightbox = document.querySelector('.lightbox');
    if (!lightbox) return;

    const lbImg = lightbox.querySelector('img');
    const lbTitle = lightbox.querySelector('.caption .title');
    const lbMeta = lightbox.querySelector('.caption .meta');

    document.querySelectorAll('[data-photo-id]').forEach(item => {
      if (item.dataset.boundLightbox === 'true') return;

      item.dataset.boundLightbox = 'true';

      item.addEventListener('click', () => {
        const photo = allPhotos.find(p => p.id === item.dataset.photoId);
        const img = item.querySelector('img');

        if (!photo && !img) return;

        lbImg.src = photo ? getFullSrc(photo) : img.src;
        lbImg.alt = photo?.alt || img?.alt || '';
        lbTitle.textContent = photo ? getDisplayTitle(photo) : item.querySelector('.title')?.textContent || '';
        lbMeta.textContent = photo ? getCaption(photo) : item.querySelector('.meta')?.textContent || '';

        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      });
    });

    if (lightbox.dataset.closeBound === 'true') return;

    const close = () => {
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    lightbox.querySelector('.lightbox-close')?.addEventListener('click', close);

    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) close();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });

    lightbox.dataset.closeBound = 'true';
  }

  /* ============================================
     ACTIVE NAV
     ============================================ */
  function setActiveNav() {
    const filename = window.location.pathname.split('/').pop() || 'index.html';
    const hash = window.location.hash;

    const currentKey =
      filename === 'gallery.html'
        ? 'gallery'
        : hash === '#about'
          ? 'about'
          : 'home';

    document.querySelectorAll('.nav-main a').forEach(link => {
      link.classList.toggle('active', link.dataset.page === currentKey);
    });
  }

  /* ============================================
     INIT
     ============================================ */
  async function init() {
    setActiveNav();
    revealVisible();

    allPhotos = await loadPhotos();

    renderHome(allPhotos);
    renderGallery(allPhotos);

    setupLightbox();
    revealVisible();

    document.querySelectorAll('#year').forEach(year => {
      year.textContent = new Date().getFullYear();
    });
  }

  init();
})();