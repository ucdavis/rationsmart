import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "authentic-white": "#F8FAF9",       // authentic_white
        "american-diamond": "#F1F5F9",      // american_diamond
        primary: "#1CA069",                 // crayola_green (colorPrimary)
        "primary-dark": "#064E3B",          // dark_aquamarine_green (colorPrimaryDark)
        honeydew: "#F0FDF4",                // honeydew (Android)
        "bright-gray-new": "#E4F7EF",       // bright_gray_new
        "raisin-black": "#231F20",          // raisin_black
        "dark-silver": "#6D6D6D",           // dark_silver
        "spanish-gray": "#999999",          // spanish_gray
        "light-gray-new": "#D3D3D3",        // light_gray_new
        "go-green": "#05BC6D",              // go_green
        "carmine-pink": "#E44A4A",          // carmine_pink
        "vivid-gamboge": "#FF9800",         // vivid_gamboge
        "sparkling-silver": "#E2E8F0",      // sparkling_silver (Android)
        "silver-sand": "#C2C2C2",           // silver_sand (inactive stars)
        "peachy-pink": "#FEC5BB",           // peachy_pink (feed delete bg)
        "red-ryb": "#FC2E20",               // red_ryb (feed delete icon)
        "celtic-blue": "#296CD3",           // celtic_blue (reset PIN)
      },
      fontFamily: {
        nunito: ["Nunito", "sans-serif"],
      },
      borderRadius: {
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.08)",
        toolbar: "0 1px 4px rgba(0,0,0,0.08)",
        btn: "0 2px 6px rgba(6,78,59,0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
