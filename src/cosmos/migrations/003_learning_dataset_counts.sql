CREATE TRIGGER IF NOT EXISTS learning_dataset_examples_ai
AFTER INSERT ON learning_dataset_examples
BEGIN
    UPDATE learning_datasets
    SET train_count = (SELECT count(*) FROM learning_dataset_examples
                       WHERE dataset_id = new.dataset_id AND split = 'train'),
        validation_count = (SELECT count(*) FROM learning_dataset_examples
                            WHERE dataset_id = new.dataset_id AND split = 'validation'),
        test_count = (SELECT count(*) FROM learning_dataset_examples
                      WHERE dataset_id = new.dataset_id AND split = 'test')
    WHERE id = new.dataset_id AND owner_id = new.owner_id;
END;

CREATE TRIGGER IF NOT EXISTS learning_dataset_examples_ad
AFTER DELETE ON learning_dataset_examples
BEGIN
    UPDATE learning_datasets
    SET train_count = (SELECT count(*) FROM learning_dataset_examples
                       WHERE dataset_id = old.dataset_id AND split = 'train'),
        validation_count = (SELECT count(*) FROM learning_dataset_examples
                            WHERE dataset_id = old.dataset_id AND split = 'validation'),
        test_count = (SELECT count(*) FROM learning_dataset_examples
                      WHERE dataset_id = old.dataset_id AND split = 'test')
    WHERE id = old.dataset_id AND owner_id = old.owner_id;
END;