from main import main


def test_main_runs(capsys):
    main()
    assert capsys.readouterr().out.strip() == "{{id}}"
