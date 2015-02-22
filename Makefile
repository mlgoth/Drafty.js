
# Run make to push and pull from Github
all:
	-git commit *
	-git push -u origin master
	git pull git@github.com:mlgoth/Drafty.js.git
