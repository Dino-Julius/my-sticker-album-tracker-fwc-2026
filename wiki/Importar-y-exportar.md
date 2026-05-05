# Importar y exportar

## Importar progreso

La app puede importar un JSON con codigos y cantidades:

```json
{
  "MEX1": 1,
  "MEX2": 0,
  "MEX3": 2,
  "FWC5": 1,
  "CC4": 3
}
```

La llave es el codigo de la estampa. El valor es la cantidad total que tienes.

- `0` = Faltante
- `1` = Tengo
- `2+` = Repetida

## Convertir desde otra app

La seccion **¿Tienes tus stickers en otra app?** se puede abrir cuando la necesites. Ahi puedes copiar un prompt para convertir listas de otra app al formato del tracker.

## Exportar

Puedes exportar o copiar:

- progreso completo en JSON,
- faltantes en CSV o tabla,
- repetidas en CSV o tabla.

Los archivos descargados usan nombre con fecha y hora.

## Lista para intercambio

La lista publica usa:

- **Me faltan**
- **Mis repetidas**

Las repetidas muestran cantidad solo cuando hay mas de una extra, por ejemplo `SUI: 1 x2`.
