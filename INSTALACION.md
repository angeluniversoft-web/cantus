# Cantus Benedictinus Hispánicus: instalación

Es una sola aplicación con dos instalaciones independientes, cada una con su propia base de datos. Las dos salen siempre de la misma versión.

| | **PC (Windows)** | **Celular (Android o iPhone)** |
|---|---|---|
| Paquete | `CantusBenedictinus_PC_v2.36.zip` | `CantusBenedictinus_Celular_v2.36.zip` (ya publicado en su dirección web) |
| Base de datos | `%LOCALAPPDATA%\CantusBenedictinus\datos\cantus.db` | Dentro del teléfono, en el almacenamiento del navegador |
| Funciona sin internet | Sí | Sí, después de abrirla la primera vez |

## PC (Windows)
1. Descomprime el ZIP en una carpeta nueva.
2. Doble clic en **`Abrir-Panel-Cantus.bat`** → opción **2** (instalar o actualizar). No pide administrador; conserva la biblioteca, los documentos, los audios y los respaldos.
3. Abre el acceso directo **Cantus Benedictinus** del escritorio.

**Nueva versión:** descomprime el ZIP nuevo, abre el panel y elige la opción 2.

## Celular
1. En el celular abre la dirección de la app con **Chrome** (Android) o **Safari** (iPhone).
2. Agrégala a la pantalla de inicio:
   - Android: menú ⋮ → **Instalar aplicación** (o «Agregar a la pantalla principal»).
   - iPhone: botón Compartir → **Agregar a inicio**.
3. Ábrela desde su ícono. La primera vez queda guardada en el teléfono; desde entonces abre sin internet.

**Nueva versión:** no hay que hacer nada. Cuando se publica una versión nueva, la app se actualiza sola la próxima vez que la abras con internet, y tus datos se conservan.

## Pasar los datos de un equipo al otro
Los dos equipos no se sincronizan solos. Se pasa un archivo:
1. En el equipo de origen: **Exportar todo (para el otro equipo)**. Guarda `Cantus_todo_<fecha>.json`, que lleva la biblioteca, el texto de los documentos, las melodías, las voces, tus grabaciones y los ajustes.
2. Lleva el archivo al otro equipo (cable, correo, Drive o WhatsApp).
3. En el equipo de destino: **Importar paquete de datos (.json)**.

Importar varias veces el mismo archivo no duplica nada: lo que ya existe se actualiza.

En el celular no se pueden leer PDF. Súbelos en el PC y pásalos con «Exportar todo»: llega su texto, página por página.

## Para quien mantiene la app
- `python3 src/build.py` construye las dos versiones a partir del mismo código: `web/` para el PC y `celular/` para el teléfono.
- `python3 src/construir_instalador.py <carpeta>` arma el instalador del PC.
- Para publicar la versión del celular, sube el contenido de `celular/` al sitio (GitHub Pages).
