#!/usr/bin/env node
'use strict'

/**
 * Genere les icones de l'application a partir de electron/assets/icon.svg.
 *
 *   icon.ico   icone de l'executable et de l'installeur (Windows)
 *   tray.png   icone de la barre des taches
 *   icon.png   rendu 512 px, utile pour une future version macOS/Linux
 *
 * Le format ICO n'est qu'un conteneur : un en-tete, une entree de 16 octets par
 * image, puis les images elles-memes. Depuis Windows Vista, ces images peuvent
 * etre des PNG — on evite donc d'avoir a encoder du bitmap BMP a la main.
 */

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const ASSETS = path.join(__dirname, '..', 'electron', 'assets')
const SOURCE = path.join(ASSETS, 'icon.svg')

/** Tailles embarquees dans le .ico. Windows choisit la plus adaptee. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * Assemble des PNG en un fichier ICO.
 * @param {Array<{size: number, data: Buffer}>} images
 */
function buildIco(images) {
  const HEADER = 6
  const ENTRY = 16

  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // reserve
  header.writeUInt16LE(1, 2) // 1 = icone (2 = curseur)
  header.writeUInt16LE(images.length, 4)

  let offset = HEADER + ENTRY * images.length
  const entries = []

  for (const { size, data } of images) {
    const entry = Buffer.alloc(ENTRY)
    // 256 s'encode par 0 : le champ ne fait qu'un octet.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette : aucune
    entry.writeUInt8(0, 3) // reserve
    entry.writeUInt16LE(1, 4) // plans
    entry.writeUInt16LE(32, 6) // bits par pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += data.length
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source introuvable : ${SOURCE}`)
    process.exit(1)
  }

  const svg = fs.readFileSync(SOURCE)

  // --- icon.ico -----------------------------------------------------------
  const images = []
  for (const size of ICO_SIZES) {
    // `density` mise a l'echelle : rasteriser un SVG a 16 px depuis une densite
    // par defaut produit un resultat baveux.
    const data = await sharp(svg, { density: Math.max(72, size * 1.5) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    images.push({ size, data })
  }

  const ico = buildIco(images)
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico)
  console.log(`icon.ico   ${ICO_SIZES.join(', ')} px — ${(ico.length / 1024).toFixed(1)} Ko`)

  // --- tray.png -----------------------------------------------------------
  // 32 px et non 16 : Windows redimensionne lui-meme, et un 32 px reduit rend
  // mieux qu'un 16 px agrandi sur un ecran a forte densite.
  const tray = await sharp(svg, { density: 144 }).resize(32, 32).png({ compressionLevel: 9 }).toBuffer()
  fs.writeFileSync(path.join(ASSETS, 'tray.png'), tray)
  console.log(`tray.png   32 px — ${(tray.length / 1024).toFixed(1)} Ko`)

  // --- icon.png -----------------------------------------------------------
  const big = await sharp(svg, { density: 384 }).resize(512, 512).png({ compressionLevel: 9 }).toBuffer()
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), big)
  console.log(`icon.png   512 px — ${(big.length / 1024).toFixed(1)} Ko`)

  console.log('\nIcones generees dans electron/assets/.')
}

main().catch((error) => {
  console.error(`Generation impossible : ${error.message}`)
  process.exit(1)
})
