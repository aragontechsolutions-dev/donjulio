import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed Don Julio…");

  // ---- Usuarios ----
  const passwordHash = await bcrypt.hash("donjulio123", 10);
  await prisma.usuario.upsert({
    where: { email: "admin@donjulio.uy" },
    update: {},
    create: {
      email: "admin@donjulio.uy",
      passwordHash,
      nombre: "Julio (Admin)",
      role: "ADMIN",
    },
  });
  await prisma.usuario.upsert({
    where: { email: "caja@donjulio.uy" },
    update: {},
    create: {
      email: "caja@donjulio.uy",
      passwordHash,
      nombre: "Cajero/a",
      role: "CAJERO",
    },
  });
  await prisma.usuario.upsert({
    where: { email: "mozo@donjulio.uy" },
    update: {},
    create: {
      email: "mozo@donjulio.uy",
      passwordHash,
      nombre: "Mozo/a",
      role: "MOZO",
    },
  });

  // ---- Estaciones (KDS) ----
  const [panaderia, reposteria, barra] = await Promise.all([
    prisma.station.upsert({
      where: { id: "st-panaderia" },
      update: {},
      create: { id: "st-panaderia", nombre: "Panadería", tipo: "PANADERIA" },
    }),
    prisma.station.upsert({
      where: { id: "st-reposteria" },
      update: {},
      create: { id: "st-reposteria", nombre: "Repostería", tipo: "REPOSTERIA" },
    }),
    prisma.station.upsert({
      where: { id: "st-barra" },
      update: {},
      create: { id: "st-barra", nombre: "Barra / Cafetería", tipo: "BARRA" },
    }),
  ]);

  // ---- Catálogo ----
  const categorias = [
    { slug: "panes", nombre: "Panes", orden: 1, station: panaderia.id },
    { slug: "facturas", nombre: "Facturas", orden: 2, station: panaderia.id },
    { slug: "bizcochos", nombre: "Bizcochos", orden: 3, station: panaderia.id },
    { slug: "tortas", nombre: "Tortas y Postres", orden: 4, station: reposteria.id },
    { slug: "masas-secas", nombre: "Masas Secas", orden: 5, station: reposteria.id },
    { slug: "cafeteria", nombre: "Cafetería", orden: 6, station: barra.id },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categorias) {
    const cat = await prisma.categoria.upsert({
      where: { slug: c.slug },
      update: { nombre: c.nombre, orden: c.orden },
      create: { slug: c.slug, nombre: c.nombre, orden: c.orden },
    });
    catMap[c.slug] = cat.id;
  }

  const productos = [
    { slug: "pan-campo", nombre: "Pan de Campo", cat: "panes", precio: 120, station: panaderia.id, destacado: true, desc: "Pan artesanal de masa madre, corteza crocante." },
    { slug: "pan-flauta", nombre: "Flauta", cat: "panes", precio: 60, station: panaderia.id, desc: "Clásica flauta uruguaya." },
    { slug: "medialunas", nombre: "Medialunas (docena)", cat: "facturas", precio: 300, station: panaderia.id, destacado: true, desc: "Manteca, doradas y hojaldradas." },
    { slug: "vigilante", nombre: "Vigilante", cat: "facturas", precio: 35, station: panaderia.id, desc: "Factura con dulce de membrillo." },
    { slug: "bizcochos-grasa", nombre: "Bizcochos de grasa (docena)", cat: "bizcochos", precio: 260, station: panaderia.id, desc: "Salados, ideales para el mate." },
    { slug: "torta-choco", nombre: "Torta de Chocolate", cat: "tortas", precio: 850, station: reposteria.id, destacado: true, desc: "Bizcochuelo húmedo con ganache." },
    { slug: "chajá", nombre: "Chajá", cat: "tortas", precio: 780, station: reposteria.id, desc: "El clásico postre uruguayo, con merengue y durazno." },
    { slug: "alfajores-maicena", nombre: "Alfajores de maicena (6u)", cat: "masas-secas", precio: 240, station: reposteria.id, requiereOctogono: true, desc: "Rellenos de dulce de leche." },
    { slug: "cafe-cortado", nombre: "Café Cortado", cat: "cafeteria", precio: 90, station: barra.id, desc: "Espresso con un toque de leche." },
    { slug: "capuccino", nombre: "Capuccino", cat: "cafeteria", precio: 130, station: barra.id, destacado: true, desc: "Con espuma de leche y cacao." },
    { slug: "agua-mineral", nombre: "Agua mineral 500ml", cat: "cafeteria", precio: 70, station: barra.id, esReventa: true, desc: "Sin gas." },
  ];

  const prodMap: Record<string, string> = {};
  for (const p of productos) {
    const prod = await prisma.producto.upsert({
      where: { slug: p.slug },
      update: { precio: p.precio, nombre: p.nombre },
      create: {
        slug: p.slug,
        nombre: p.nombre,
        descripcion: p.desc,
        precio: p.precio,
        categoriaId: catMap[p.cat],
        stationId: p.station,
        destacado: p.destacado ?? false,
        esReventa: p.esReventa ?? false,
        requiereOctogono: p.requiereOctogono ?? false,
      },
    });
    prodMap[p.slug] = prod.id;
  }

  // ---- Modificadores de cafetería (ejemplo: tipo de leche) ----
  const grupoLeche = await prisma.modifierGroup.upsert({
    where: { id: "mg-leche" },
    update: {},
    create: {
      id: "mg-leche",
      nombre: "Tipo de leche",
      minSelect: 0,
      maxSelect: 1,
      modifiers: {
        create: [
          { nombre: "Entera", priceDelta: 0 },
          { nombre: "Descremada", priceDelta: 0 },
          { nombre: "Vegetal", priceDelta: 30 },
        ],
      },
    },
  });
  await prisma.productModifierGroup.upsert({
    where: {
      productoId_groupId: {
        productoId: prodMap["capuccino"],
        groupId: grupoLeche.id,
      },
    },
    update: {},
    create: { productoId: prodMap["capuccino"], groupId: grupoLeche.id },
  });

  // ---- Insumos + receta con sub-receta (BOM multinivel) ----
  const harina = await prisma.insumo.upsert({
    where: { id: "ins-harina" },
    update: {},
    create: { id: "ins-harina", nombre: "Harina 000", unidad: "KG", costoUnitario: 45, stockActual: 100, puntoReorden: 20 },
  });
  const azucar = await prisma.insumo.upsert({
    where: { id: "ins-azucar" },
    update: {},
    create: { id: "ins-azucar", nombre: "Azúcar", unidad: "KG", costoUnitario: 55, stockActual: 50, puntoReorden: 10 },
  });
  const leche = await prisma.insumo.upsert({
    where: { id: "ins-leche" },
    update: {},
    create: { id: "ins-leche", nombre: "Leche", unidad: "L", costoUnitario: 42, stockActual: 40, puntoReorden: 10 },
  });

  // Sub-receta: Crema pastelera (rinde 2.4 kg)
  const cremaPastelera = await prisma.receta.upsert({
    where: { id: "rec-crema" },
    update: {},
    create: {
      id: "rec-crema",
      nombre: "Crema pastelera",
      isSubRecipe: true,
      yieldQty: 2.4,
      yieldUnit: "KG",
      ingredientes: {
        create: [
          { insumoId: leche.id, cantidad: 2, unidad: "L" },
          { insumoId: azucar.id, cantidad: 0.4, unidad: "KG" },
        ],
      },
    },
  });

  // Receta de producto terminado que usa la sub-receta
  await prisma.receta.upsert({
    where: { id: "rec-torta-choco" },
    update: {},
    create: {
      id: "rec-torta-choco",
      nombre: "Torta de Chocolate",
      productoId: prodMap["torta-choco"],
      yieldQty: 1,
      yieldUnit: "UNIDAD",
      mermaPct: 5,
      manoObraCosto: 200,
      overheadCosto: 80,
      ingredientes: {
        create: [
          { insumoId: harina.id, cantidad: 0.5, unidad: "KG" },
          { insumoId: azucar.id, cantidad: 0.3, unidad: "KG" },
          { subRecetaId: cremaPastelera.id, cantidad: 0.6, unidad: "KG" },
        ],
      },
    },
  });

  // ---- CMS de la landing ----
  const contenido: Record<string, string> = {
    "hero.titulo": "Panadería Artesanal Don Julio",
    "hero.subtitulo": "Pan de verdad, horneado cada día en Maldonado.",
    "historia.titulo": "Nuestra Historia",
    "historia.texto":
      "Desde hace años amasamos con las manos y el corazón. Don Julio nació como un sueño familiar y hoy es el aroma que despierta al barrio cada mañana.",
  };
  for (const [clave, valor] of Object.entries(contenido)) {
    await prisma.contenidoLanding.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor },
    });
  }

  await prisma.configContacto.deleteMany();
  await prisma.configContacto.create({
    data: {
      direccion: "Av. Roosevelt, Maldonado, Uruguay",
      telefono: "+598 4222 0000",
      whatsapp: "+598 99 000 000",
      email: "hola@donjulio.uy",
      instagram: "@panaderiadonjulio",
      // Sin mapsUrl: la web genera las indicaciones hasta el pin. El admin puede
      // pegar el link de la ficha de Google desde Panel → Contenido web.
      lat: -34.9089,
      lng: -54.9581,
      mapZoom: 16,
    },
  });

  const horarios = [
    { diaSemana: 1, apertura: "07:00", cierre: "20:00" },
    { diaSemana: 2, apertura: "07:00", cierre: "20:00" },
    { diaSemana: 3, apertura: "07:00", cierre: "20:00" },
    { diaSemana: 4, apertura: "07:00", cierre: "20:00" },
    { diaSemana: 5, apertura: "07:00", cierre: "21:00" },
    { diaSemana: 6, apertura: "07:30", cierre: "21:00" },
    { diaSemana: 0, apertura: "08:00", cierre: "13:00" },
  ];
  for (const h of horarios) {
    await prisma.horario.upsert({
      where: { diaSemana: h.diaSemana },
      update: h,
      create: h,
    });
  }

  await prisma.testimonio.deleteMany();
  await prisma.testimonio.createMany({
    data: [
      { autor: "María P.", texto: "Las mejores medialunas de Maldonado, sin dudas.", rating: 5, aprobado: true, orden: 1 },
      { autor: "Andrés G.", texto: "El pan de campo es una locura. Volvemos siempre.", rating: 5, aprobado: true, orden: 2 },
    ],
  });

  // ---- Salón: zona + mesas ----
  const salon = await prisma.zona.upsert({
    where: { id: "zona-salon" },
    update: {},
    create: { id: "zona-salon", nombre: "Salón principal" },
  });
  for (let n = 1; n <= 8; n++) {
    await prisma.mesa.upsert({
      where: { numero: n },
      update: {},
      create: {
        numero: n,
        zonaId: salon.id,
        capacidad: n <= 4 ? 2 : 4,
      },
    });
  }

  console.log("✅ Seed completo. Login admin: admin@donjulio.uy / donjulio123");
  console.log("   Cajero: caja@donjulio.uy · Mozo: mozo@donjulio.uy (misma clave)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
