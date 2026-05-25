# pack a run directory for transfer off vast.ai and render a markdown report.
# see docs/HANDBOOK.md sections 5 and 6.


def render_report(run_dir):
    # read config.json, train_metrics.json, eval_metrics.json from run_dir and
    # write a report.md summarizing them (eval table first). return the path.
    raise NotImplementedError


def pack_run(run_dir, out_path):
    # tar.gz the whole run dir to out_path (arcname = run_dir.name), compute the
    # sha256 of the tarball. return (out_path, sha256_hexdigest).
    raise NotImplementedError
