# render the report, tar the run, print the sha256 and the scp line for vast.ai.
# see docs/HANDBOOK.md sections 5 (06_pack_and_ship.py) and 6.
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs-dir", default="runs")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--out-dir", default="dist")
    args = parser.parse_args()

    # steps to implement:
    # 1. render_report(runs/<id>).
    # 2. tar_path, sha = pack_run(runs/<id>, dist/<id>.tar.gz).
    # 3. print a SHIP-VERIFIED block: tarball path, size, sha256, the
    #    "scp -P <port> root@<host>:<path> ." line, and the
    #    "shasum -a 256 <file>" verify command. (this is the vast.ai handoff.)
    raise NotImplementedError


if __name__ == "__main__":
    main()
