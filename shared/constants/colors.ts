const crc32=function(r){for(var a,o=[],c=0;c<256;c++){a=c;for(var f=0;f<8;f++)a=1&a?3988292384^a>>>1:a>>>1;o[c]=a}for(var n=-1,t=0;t<r.length;t++)n=n>>>8^o[255&(n^r.charCodeAt(t))];return(-1^n)>>>0};

export const getColor = (n: number) => {
  const rgb = [0, 0, 0];

  for (let i = 0; i < 24; i++) {
    rgb[i%3] <<= 1;
    rgb[i%3] |= n & 0x01;
    n >>= 1;
  }

  return '#' + rgb.reduce((a, c) => (c > 0x0f ? c.toString(16) : '0' + c.toString(16)) + a, '')
}

export const getColorByString = (str: string) => {
  return '#' + ('000000' + crc32(str).toString(16)).slice(-6)
}

export const makeGreyish = (color: string, intensity: number): string => {
  // Validate and normalize hex color
  const isValidHex = /^#([A-Fa-f0-9]{3}){1,2}$/.test(color)
  let r: number, g: number, b: number

  if (isValidHex) {
    // Expand shorthand hex (#RGB) to full hex (#RRGGBB)
    const normalizedColor = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color

    r = parseInt(normalizedColor.slice(1, 3), 16)
    g = parseInt(normalizedColor.slice(3, 5), 16)
    b = parseInt(normalizedColor.slice(5, 7), 16)
  } else if (/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/.test(color)) {
    // Extract RGB from rgb(...) string
    const matches = color.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/)!
    r = parseInt(matches[1], 10)
    g = parseInt(matches[2], 10)
    b = parseInt(matches[3], 10)
  } else {
    throw new Error("Invalid color format. Use hex (#RRGGBB or #RGB) or RGB (rgb(r, g, b)).")
  }

  // Convert to grayscale
  const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114)

  // Blend original color with gray based on intensity
  const blend = (original: number, gray: number) =>
    Math.round(original * (1 - intensity) + gray * intensity)

  const blendedR = blend(r, gray)
  const blendedG = blend(g, gray)
  const blendedB = blend(b, gray)

  // Return the greyish color as an RGB string
  return `rgb(${blendedR}, ${blendedG}, ${blendedB})`
}

