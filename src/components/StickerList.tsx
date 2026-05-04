import { formatStickerCollectionLabel, getStickerQuantity, getStickerStatus, STATUS_LABELS } from "../lib/album";
import type { Progress, Sticker } from "../types";

type StickerListProps = {
  stickers: Sticker[];
  progress: Progress;
  onSetQuantity: (code: string, quantity: number) => void;
  compact?: boolean;
};

export function StickerList({ stickers, progress, onSetQuantity, compact = false }: StickerListProps) {
  if (stickers.length === 0) {
    return <p className="empty-state">No hay estampas con esos filtros.</p>;
  }

  return (
    <>
      <div className="sticker-cards">
        {stickers.map((sticker) => (
          <StickerCard
            compact={compact}
            key={sticker.code}
            sticker={sticker}
            quantity={getStickerQuantity(sticker.code, progress)}
            onSetQuantity={onSetQuantity}
          />
        ))}
      </div>

      <div className="desktop-table" aria-label="Lista de estampas">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Colección</th>
              <th>Grupo</th>
              <th>Sección</th>
              <th>Estado</th>
              <th>Cantidad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {stickers.map((sticker) => {
              const quantity = getStickerQuantity(sticker.code, progress);
              const status = getStickerStatus(sticker.code, progress);

              return (
                <tr key={sticker.code}>
                  <td>
                    <strong>{sticker.code}</strong>
                  </td>
                  <td>{formatStickerCollectionLabel(sticker)}</td>
                  <td>{sticker.group}</td>
                  <td>{sticker.section}</td>
                  <td>
                    <span className={`status status-${status}`}>{getStatusLabel(status, quantity)}</span>
                  </td>
                  <td>{quantity}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" onClick={() => onSetQuantity(sticker.code, quantity - 1)} aria-label={`Restar ${sticker.code}`}>
                        -
                      </button>
                      <button className="primary-button small" onClick={() => onSetQuantity(sticker.code, quantity + 1)}>
                        +1
                      </button>
                      <button className="ghost-button small" onClick={() => onSetQuantity(sticker.code, 1)}>
                        La tengo
                      </button>
                      <button className="ghost-button small" onClick={() => onSetQuantity(sticker.code, 0)}>
                        Faltante
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StickerCard({
  sticker,
  quantity,
  onSetQuantity,
  compact,
}: {
  sticker: Sticker;
  quantity: number;
  onSetQuantity: (code: string, quantity: number) => void;
  compact: boolean;
}) {
  const status = quantity === 0 ? "missing" : quantity === 1 ? "owned" : "repeated";
  const extras = Math.max(0, quantity - 1);

  return (
    <article className={`sticker-card ${compact ? "compact" : ""}`}>
      <div>
        <div className="sticker-title">
          <strong>{sticker.code}</strong>
          <span className={`status status-${status}`}>{getStatusLabel(status, quantity)}</span>
        </div>
        <p>
          {formatStickerCollectionLabel(sticker)} · {sticker.section}
        </p>
        {sticker.displayName ? <small>{sticker.displayName}</small> : null}
      </div>

      <div className="quantity-control" aria-label={`Cantidad de ${sticker.code}`}>
        <button className="icon-button" onClick={() => onSetQuantity(sticker.code, quantity - 1)} aria-label={`Restar ${sticker.code}`}>
          -
        </button>
        <output>{quantity}</output>
        <button className="primary-button plus-button" onClick={() => onSetQuantity(sticker.code, quantity + 1)} aria-label={`Sumar ${sticker.code}`}>
          +1
        </button>
      </div>

      <div className="quick-actions">
        <button className="ghost-button" onClick={() => onSetQuantity(sticker.code, 1)}>
          La tengo
        </button>
        <button className="ghost-button" onClick={() => onSetQuantity(sticker.code, 0)}>
          Faltante
        </button>
        {extras > 0 ? <span className="extras">Extra para cambiar: {extras}</span> : null}
      </div>
    </article>
  );
}

function getStatusLabel(status: "missing" | "owned" | "repeated", quantity: number) {
  if (status !== "repeated") {
    return STATUS_LABELS[status];
  }

  const extras = Math.max(0, quantity - 1);
  return `Repetida x${extras} ${extras === 1 ? "extra" : "extras"}`;
}
