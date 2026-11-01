"""Local operator interface for consented learning data curation."""

import argparse
import json
import os
import sys

from cosmos.learning import SQLiteLearningStore
from cosmos.learning.store import FEEDBACK_TYPES


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Curate explicitly consented COSMOS experiences.")
    parser.add_argument(
        "--database",
        default=os.getenv(
            "COSMOS_LEARNING_DB", "~/.local/share/cosmos/learning.sqlite3"
        ),
        help="SQLite database path (or COSMOS_LEARNING_DB)",
    )
    parser.add_argument(
        "--owner",
        default=os.getenv("COSMOS_LOCAL_USER_ID", "local"),
        help="Local data owner namespace (or COSMOS_LOCAL_USER_ID)",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="Collect an experience with explicit consent")
    add.add_argument("--input", required=True, help="User request text")
    add.add_argument("--output", required=True, help="Model response text")
    add.add_argument("--feedback", choices=FEEDBACK_TYPES, required=True)
    add.add_argument("--desired-output", help="Verified/corrected target, when available")
    add.add_argument("--rating", type=int, choices=range(1, 6))
    add.add_argument("--source-reference", default="")
    add.add_argument("--consent", action="store_true", required=True)

    list_command = commands.add_parser("list", help="List this owner's collected experiences")
    list_command.add_argument(
        "--status", choices=("pending", "approved", "rejected")
    )

    review = commands.add_parser("review", help="Approve or reject one experience")
    review.add_argument("experience_id")
    review.add_argument("--decision", choices=("approved", "rejected"), required=True)

    delete = commands.add_parser("delete", help="Delete one experience")
    delete.add_argument("experience_id")

    dataset = commands.add_parser("dataset", help="Manage curated dataset versions")
    dataset_commands = dataset.add_subparsers(dest="dataset_command", required=True)
    create = dataset_commands.add_parser("create", help="Version approved examples into a dataset")
    create.add_argument("name")
    create.add_argument("--train-ratio", type=float, default=0.8)
    create.add_argument("--validation-ratio", type=float, default=0.1)
    create.add_argument("--test-ratio", type=float, default=0.1)
    create.add_argument("--minimum-quality", type=float, default=0.6)
    dataset_commands.add_parser("list", help="List dataset versions")
    export = dataset_commands.add_parser("export", help="Write a dataset as JSONL to stdout")
    export.add_argument("dataset_id")

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    store = SQLiteLearningStore(args.database)

    try:
        if args.command == "add":
            result = store.collect(
                owner_id=args.owner,
                input_text=args.input,
                model_output=args.output,
                desired_output=args.desired_output,
                feedback_type=args.feedback,
                rating=args.rating,
                source_reference=args.source_reference,
                consent=args.consent,
            )
            if result is None:
                parser.error("explicit consent is required")
            experience, created = result
            print(
                json.dumps(
                    {
                        "id": experience.id,
                        "created": created,
                        "status": experience.review_status,
                    }
                )
            )
        elif args.command == "list":
            records = store.list_experiences(owner_id=args.owner, status=args.status)
            print(json.dumps([record.as_dict() for record in records], indent=2))
        elif args.command == "review":
            record = store.review(
                owner_id=args.owner,
                experience_id=args.experience_id,
                decision=args.decision,
            )
            if record is None:
                parser.error("experience not found for this owner")
            print(json.dumps({"id": record.id, "status": record.review_status}))
        elif args.command == "delete":
            if not store.delete(owner_id=args.owner, experience_id=args.experience_id):
                parser.error("experience not found for this owner")
            print(json.dumps({"deleted": args.experience_id}))
        elif args.command == "dataset":
            _run_dataset_command(parser, store, args)
    except (OSError, ValueError) as error:
        print(f"cosmos-learning: {error}", file=sys.stderr)
        raise SystemExit(2) from error


def _run_dataset_command(parser: argparse.ArgumentParser, store: SQLiteLearningStore, args) -> None:
    if args.dataset_command == "create":
        dataset = store.create_dataset(
            owner_id=args.owner,
            name=args.name,
            train_ratio=args.train_ratio,
            validation_ratio=args.validation_ratio,
            test_ratio=args.test_ratio,
            minimum_quality=args.minimum_quality,
        )
        print(
            json.dumps(
                {
                    "id": dataset.id,
                    "name": dataset.name,
                    "version": dataset.version,
                    "train": dataset.train_count,
                    "validation": dataset.validation_count,
                    "test": dataset.test_count,
                }
            )
        )
    elif args.dataset_command == "list":
        print(
            json.dumps(
                [
                    {
                        "id": dataset.id,
                        "name": dataset.name,
                        "version": dataset.version,
                        "train": dataset.train_count,
                        "validation": dataset.validation_count,
                        "test": dataset.test_count,
                    }
                    for dataset in store.list_datasets(owner_id=args.owner)
                ],
                indent=2,
            )
        )
    else:
        try:
            print(store.export_dataset_jsonl(owner_id=args.owner, dataset_id=args.dataset_id))
        except ValueError as error:
            parser.error(str(error))


if __name__ == "__main__":
    main()