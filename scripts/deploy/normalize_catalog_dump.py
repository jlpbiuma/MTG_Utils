"""Remove explicitly retired columns from pg_dump COPY blocks without changing DBs."""

import re
import sys


RETIRED_COLUMNS = {
    "card_printings": {
        "price_cardtrader_trend", "price_cardtrader_min", "price_cardtrader_max",
    },
    "card_catalog": {
        f"price_{provider}_{metric}"
        for provider in ("cardmarket", "cardtrader", "goldfish")
        for metric in ("trend", "min", "max")
    } | {"prices_updated_at"},
}
COPY_HEADER = re.compile(r'^COPY (?:public\.)(\w+) \((.+)\) FROM stdin;\n$')


def normalize(source, destination):
    columns = None
    keep = None
    for line in source:
        if columns is not None:
            if line == "\\.\n":
                columns = keep = None
            elif keep is not None:
                # COPY text escapes embedded tabs/newlines; literal tabs separate fields.
                fields = line.removesuffix("\n").split("\t")
                if len(fields) != len(columns):
                    raise ValueError("Invalid COPY row width")
                line = "\t".join(fields[index] for index in keep) + "\n"
            destination.write(line)
            continue

        match = COPY_HEADER.match(line)
        if match:
            table, names = match.groups()
            columns = names.split(", ")
            retired = RETIRED_COLUMNS.get(table, set())
            keep = [i for i, name in enumerate(columns) if name.strip('"') not in retired]
            if len(keep) == len(columns):
                keep = None
            else:
                names = ", ".join(columns[index] for index in keep)
                line = f"COPY public.{table} ({names}) FROM stdin;\n"
        destination.write(line)
    if columns is not None:
        raise ValueError("Incomplete COPY block")


if __name__ == "__main__":
    normalize(sys.stdin, sys.stdout)
