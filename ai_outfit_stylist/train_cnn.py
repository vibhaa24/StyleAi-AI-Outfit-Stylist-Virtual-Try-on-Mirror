from __future__ import annotations

from pathlib import Path

import keras
import tensorflow as tf
from keras import layers, models


IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 15


def build_model(num_classes: int) -> keras.Model:
    return models.Sequential(
        [
            layers.Input(shape=(*IMG_SIZE, 3)),
            layers.Rescaling(1.0 / 255),
            layers.Conv2D(32, 3, activation="relu"),
            layers.MaxPooling2D(),
            layers.Conv2D(64, 3, activation="relu"),
            layers.MaxPooling2D(),
            layers.Conv2D(128, 3, activation="relu"),
            layers.MaxPooling2D(),
            layers.GlobalAveragePooling2D(),
            layers.Dense(128, activation="relu"),
            layers.Dropout(0.4),
            layers.Dense(num_classes, activation="softmax"),
        ]
    )


def main() -> None:
    project_root = Path(__file__).resolve().parent
    train_dir = project_root / "dataset" / "train"
    val_dir = project_root / "dataset" / "val"
    model_dir = project_root / "model"
    model_dir.mkdir(parents=True, exist_ok=True)

    if not train_dir.exists() or not val_dir.exists():
        raise FileNotFoundError("dataset/train and dataset/val must exist before training.")

    train_ds = keras.utils.image_dataset_from_directory(
        train_dir,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
    )

    val_ds = keras.utils.image_dataset_from_directory(
        val_dir,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
    )

    class_names = train_ds.class_names
    if not class_names:
        raise ValueError("No training classes found in dataset/train.")

    autotune = tf.data.AUTOTUNE
    train_ds = train_ds.cache().shuffle(1000).prefetch(buffer_size=autotune)
    val_ds = val_ds.cache().prefetch(buffer_size=autotune)

    model = build_model(len(class_names))
    model.compile(
        optimizer="adam",
        loss=keras.losses.SparseCategoricalCrossentropy(),
        metrics=["accuracy"],
    )

    callbacks = [
        keras.callbacks.ModelCheckpoint(
            filepath=str(model_dir / "outfit_cnn.keras"),
            monitor="val_accuracy",
            save_best_only=True,
        ),
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=3,
            restore_best_weights=True,
        ),
    ]

    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        callbacks=callbacks,
    )

    model.save(model_dir / "outfit_cnn_final.keras")

    print("Training complete.")
    print(f"Classes: {class_names}")
    print(f"Best model: {model_dir / 'outfit_cnn.keras'}")
    print(f"Final model: {model_dir / 'outfit_cnn_final.keras'}")


if __name__ == "__main__":
    main()