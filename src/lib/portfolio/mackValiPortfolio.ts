import type { PortfolioSiteData } from "./types";

export const mackValiPortfolio: PortfolioSiteData = {
  handle: "mackvali",
  name: "MACK VALI",
  headline: "Designing useful things.",
  intro:
    "I build software, brands, visual work, clothing, and creative systems.",
  note: "Design · Build · Refine · Repeat",

  software: [
    {
      slug: "creator",
      title: "CREATOR",
      eyebrow: "Flagship software",
      description:
        "A personal operating system for goals, scheduling, health, money, focus, and the systems around everyday life.",
      category: "software",
      visual: "creator",
      year: "2026",
      role: "Product design · Engineering · UX",
      stack: ["Next.js", "React", "TypeScript", "Supabase", "Capacitor"],
      featured: true,
      detail: {
        intro:
          "CREATOR is an attempt to bring the systems used to run everyday life into one coherent environment instead of scattering them across disconnected apps.",
        sections: [
          {
            eyebrow: "01 · Overview",
            title: "One system for the moving parts of life.",
            body:
              "Goals, projects, scheduling, focus, health, money, habits, and personal context live in a shared system so each part can understand the others.",
            visual: "creator",
          },
          {
            eyebrow: "02 · Product",
            title: "Built around actions instead of dashboards.",
            body:
              "The product is designed around actually moving through the day: deciding what matters, scheduling it, entering focus, recording outcomes, and seeing how those actions relate to larger goals.",
          },
          {
            eyebrow: "03 · Design",
            title: "Dense systems without a dense feeling.",
            body:
              "CREATOR contains a lot of information, so the interface aims to remain quiet, spatially consistent, and understandable without flattening the depth of the underlying system.",
          },
          {
            eyebrow: "04 · Engineering",
            title: "A real cross-platform product.",
            body:
              "The application is built with Next.js, React, TypeScript, Supabase, and Capacitor, with a web application and native iOS wrapper sharing the same core product.",
          },
        ],
      },
    },
    {
      slug: "small-business-sites",
      title: "Small Business Sites",
      eyebrow: "Client work",
      description:
        "Focused websites and digital tools for small businesses and real-world services.",
      category: "software",
      visual: "business",
      detail: {
        intro:
          "I build focused websites and digital tools for small businesses that need something useful, clear, and easy for customers to understand.",
        sections: [
          {
            eyebrow: "01 · Approach",
            title: "Built around the business, not around a template.",
            body:
              "Each project starts with what the business actually needs people to understand or do: book, call, request a quote, learn about a service, or trust the company enough to reach out.",
            visual: "business",
          },
          {
            eyebrow: "02 · Work",
            title: "Real businesses. Real constraints.",
            body:
              "This section will hold the websites and tools I have built for small businesses, including screenshots, project context, and the specific problems each build was meant to solve.",
          },
        ],
      },
    },
    {
      slug: "apps-tools",
      title: "Apps & Tools",
      eyebrow: "Selected builds",
      description:
        "Useful software experiments, internal tools, and focused digital products.",
      category: "software",
      visual: "business",
    },
  ],

  clothing: [
    {
      slug: "yump",
      title: "Yump.",
      eyebrow: "Clothing",
      description:
        "A clothing brand built around simple pieces, graphic identity, and its own visual language.",
      category: "clothing",
      visual: "yump",
      detail: {
        intro:
          "Yump. is a clothing project exploring simple garments, identity, graphics, and the relationship between everyday clothing and a recognizable visual world.",
        sections: [
          {
            eyebrow: "01 · Brand",
            title: "Simple enough to live in.",
            body:
              "The brand direction stays restrained so the identity can come through the details, garment choices, typography, graphics, and photography.",
            visual: "yump",
          },
          {
            eyebrow: "02 · Collection",
            title: "The work becomes the lookbook.",
            body:
              "This page will eventually hold real garments, product photography, graphics, samples, and collection notes as the brand develops.",
          },
        ],
      },
    },
    {
      slug: "abyssal-insight",
      title: "Abyssal Insight",
      eyebrow: "Clothing / concept",
      description:
        "A darker visual project exploring depth, perspective, imagery, and clothing.",
      category: "clothing",
      visual: "abyssal",
      detail: {
        intro:
          "Abyssal Insight is a darker clothing and visual identity project centered around depth, perspective, and imagery that feels discovered rather than decorated.",
        sections: [
          {
            eyebrow: "01 · Direction",
            title: "See deeper.",
            body:
              "The visual system can hold garments, artwork, symbols, photography, and campaign material without forcing everything into one graphic treatment.",
            visual: "abyssal",
          },
        ],
      },
    },
  ],

  visual: [
    {
      slug: "selected-visuals",
      title: "Selected Visuals",
      eyebrow: "Graphic work",
      description: "Graphics, artwork, experiments, and visual systems.",
      category: "visual",
      visual: "visual-one",
    },
    {
      slug: "identity-experiments",
      title: "Identity",
      eyebrow: "Design studies",
      description: "Typography, symbols, layouts, and brand exploration.",
      category: "visual",
      visual: "visual-two",
    },
    {
      slug: "artwork",
      title: "Artwork",
      eyebrow: "Selected studies",
      description: "Images, compositions, covers, and visual experiments.",
      category: "visual",
      visual: "visual-three",
    },
  ],

  studio: {
    title: "The creative equipment behind the work.",
    description:
      "A look at the room, hardware, instruments, software, and process used to make music and everything around it.",
    equipment: [
      "Computer + workspace",
      "Audio interface",
      "Studio monitors",
      "Microphones",
      "Headphones",
      "MIDI + instruments",
    ],
    visual: "studio",
  },
};
